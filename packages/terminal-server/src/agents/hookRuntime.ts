import * as fs from 'node:fs';
import * as path from 'node:path';
import { writeClaudeHookSettings } from './claude/hooks';
import { classifyClaudeHookEvent, isClaudeSessionTransition } from './claude/status';
import { writeCodexHookHome } from './codex/hooks';
import { classifyCodexHookEvent, isCodexSessionTransition } from './codex/status';

export interface ProviderHookRuntime {
  claudeSettingsPath?: string;
  codexHomePath?: string;
  scriptPath: string;
}

export function buildProviderHookPayload(kind: string, value: Record<string, unknown>) {
  const event = String(value.hook_event_name ?? value.hookEventName ?? value.event_type ?? value.event ?? value.type ?? '').toLowerCase();
  const source = String(value.source ?? value.session_source ?? value.sessionSource ?? '').toLowerCase();
  const sessionStart = event.includes('sessionstart') || event.includes('session_start');
  if (sessionStart && source === 'compact') return null;
  const state = kind === 'codex' ? classifyCodexHookEvent(event) : classifyClaudeHookEvent(event);
  if (!state) return null;
  const sessionTransition = kind === 'codex'
    ? isCodexSessionTransition(event, source)
    : isClaudeSessionTransition(event, source);
  const providerSessionId = kind === 'codex'
    ? value.session_id ?? value.sessionId ?? value.thread_id ?? value.threadId
    : value.session_id ?? value.sessionId ?? value.conversation_id ?? value.conversationId;
  return {
    state,
    providerEvent: event,
    ...(source ? { sessionSource: source } : {}),
    ...(sessionTransition ? { sessionTransition: true } : {}),
    ...(typeof providerSessionId === 'string' && providerSessionId ? { providerSessionId } : {}),
  };
}

const HOOK_SCRIPT = `import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
${classifyClaudeHookEvent.toString()}
${isClaudeSessionTransition.toString()}
${classifyCodexHookEvent.toString()}
${isCodexSessionTransition.toString()}
${buildProviderHookPayload.toString()}
function inheritBohemianEnv() {
  if (process.env.BOHEMIAN_TERMINAL_ID && process.env.BOHEMIAN_AGENT_LAUNCH_TOKEN) return;
  try {
    let pid = process.ppid;
    for (let i = 0; i < 8 && pid > 1; i += 1) {
      const command = execFileSync('ps', ['eww', '-p', String(pid), '-o', 'command='], { encoding: 'utf8' });
      for (const token of command.split(/\\s+/)) {
        const eq = token.indexOf('=');
        if (eq <= 0 || !token.startsWith('BOHEMIAN_')) continue;
        process.env[token.slice(0, eq)] = token.slice(eq + 1);
      }
      if (process.env.BOHEMIAN_TERMINAL_ID && process.env.BOHEMIAN_AGENT_LAUNCH_TOKEN) return;
      const parent = Number(execFileSync('ps', ['-p', String(pid), '-o', 'ppid='], { encoding: 'utf8' }).trim());
      if (!Number.isInteger(parent)) return;
      pid = parent;
    }
  } catch {}
}
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { input += chunk; });
process.stdin.on('end', () => {
  inheritBohemianEnv();
  let value = {};
  try { value = JSON.parse(input || '{}'); } catch {}
  if (!value || typeof value !== 'object') value = {};
  if (typeof value.payload === 'object' && value.payload) value = { ...value.payload, ...value };
  const kind = String(process.env.BOHEMIAN_AGENT_KIND || '');
  const payload = buildProviderHookPayload(kind, value);
  if (!payload) { process.stdout.write('{}\\n'); return; }
  const wsUrl = process.env.BOHEMIAN_TERMINAL_WS_URL;
  const terminalId = process.env.BOHEMIAN_TERMINAL_ID;
  const launchToken = process.env.BOHEMIAN_AGENT_LAUNCH_TOKEN;
  const token = process.env.BOHEMIAN_TERMINAL_TOKEN;
  if (!wsUrl || !terminalId || !launchToken || !token || typeof WebSocket !== 'function') {
    process.stdout.write('{}\\n'); return;
  }
  const timer = setTimeout(() => process.exit(0), 900);
  try {
    const socket = new WebSocket(wsUrl + '?token=' + encodeURIComponent(token));
    socket.addEventListener('open', () => {
      socket.send(JSON.stringify({ type: 'agent-status', terminalId, launchToken, payload }));
      process.stdout.write('{}\\n');
      setTimeout(() => { clearTimeout(timer); socket.close(); process.exit(0); }, 30).unref?.();
    });
    socket.addEventListener('error', () => { clearTimeout(timer); process.stdout.write('{}\\n'); process.exit(0); });
  } catch { clearTimeout(timer); process.stdout.write('{}\\n'); }
});
`;

export function prepareProviderHookRuntime(
  stateDir: string,
  nodePath: string,
  options: { enableClaude?: boolean; enableCodex?: boolean } = {},
): ProviderHookRuntime | undefined {
  if (options.enableClaude === false && options.enableCodex === false) return undefined;
  const root = path.join(stateDir, 'agent-hooks');
  const scriptPath = path.join(root, 'provider-agent-status.mjs');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  writePrivate(scriptPath, HOOK_SCRIPT);
  const runtime: ProviderHookRuntime = { scriptPath };
  const command = hookCommand(nodePath, scriptPath, root);

  if (options.enableClaude !== false) {
    runtime.claudeSettingsPath = writeClaudeHookSettings(path.join(root, 'claude-settings.json'), command);
  }
  if (options.enableCodex !== false) {
    runtime.codexHomePath = writeCodexHookHome(path.join(root, 'codex-home'), command);
  }
  return runtime;
}

function hookCommand(nodePath: string, scriptPath: string, root: string): string {
  const nodeCommand = `${quote(nodePath)} ${quote(scriptPath)}`;
  const shellPath = path.join(root, 'provider-agent-status.sh');
  writePrivate(shellPath, [
    '#!/bin/sh',
    'payload=$({ command -p cat 2>/dev/null || cat; })',
    '[ -n "$payload" ] || exit 0',
    `printf '%s' "$payload" | ${nodeCommand}`,
    'exit 0',
    '',
  ].join('\n'));
  return `if [ -f ${quote(shellPath)} ] && [ -r ${quote(shellPath)} ]; then /bin/sh ${quote(shellPath)}; else { command -p cat 2>/dev/null || cat; } >/dev/null 2>&1 || :; fi`;
}

function writePrivate(file: string, content: string): void {
  fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
}

function quote(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
