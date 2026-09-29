import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { classifyClaudeHookEvent, isClaudeSessionTransition } from './agents/claude/status';
import { classifyCodexHookEvent, isCodexSessionTransition } from './agents/codex/status';
import { buildProviderHookPayload, prepareProviderHookRuntime } from './agents/hookRuntime';

const tempDirs: string[] = [];

afterEach(() => {
  for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('provider hook lifecycle', () => {
  it('keeps the parent turn open when a Claude subagent stops', () => {
    expect(classifyClaudeHookEvent('UserPromptSubmit')).toBe('working');
    expect(classifyClaudeHookEvent('PermissionRequest')).toBe('waiting');
    expect(classifyClaudeHookEvent('PreToolUse')).toBe('working');
    expect(classifyClaudeHookEvent('SubagentStop')).toBe('working');
    expect(classifyClaudeHookEvent('Stop')).toBe('done');
    expect(classifyClaudeHookEvent('StopFailure')).toBe('done');
    expect(classifyClaudeHookEvent('SessionEnd')).toBe('done');
    expect(classifyClaudeHookEvent('PermissionDenied')).toBe('working');
  });

  it('treats Claude resume, clear and fork as topic changes but not compact', () => {
    expect(isClaudeSessionTransition('SessionStart', 'resume')).toBe(true);
    expect(isClaudeSessionTransition('SessionStart', 'clear')).toBe(true);
    expect(isClaudeSessionTransition('SessionStart', 'fork')).toBe(true);
    expect(isClaudeSessionTransition('SessionStart', 'compact')).toBe(false);
    expect(isClaudeSessionTransition('Stop', 'resume')).toBe(false);
    expect(buildProviderHookPayload('claude-code', {
      hook_event_name: 'SessionStart',
      source: 'resume',
      session_id: 'claude-session-b',
      id: 'not-the-session-id',
    })).toMatchObject({
      state: 'done',
      providerSessionId: 'claude-session-b',
      sessionSource: 'resume',
      sessionTransition: true,
    });
    expect(buildProviderHookPayload('claude-code', {
      hook_event_name: 'SessionStart',
      source: 'compact',
      session_id: 'claude-session-b',
    })).toBeNull();
  });

  it('treats Codex resume and clear as topic changes but not compact', () => {
    expect(classifyCodexHookEvent('SessionStart')).toBe('done');
    expect(isCodexSessionTransition('SessionStart', 'resume')).toBe(true);
    expect(isCodexSessionTransition('SessionStart', 'clear')).toBe(true);
    expect(isCodexSessionTransition('SessionStart', 'compact')).toBe(false);
    expect(isCodexSessionTransition('Stop', 'resume')).toBe(false);
    expect(buildProviderHookPayload('codex', {
      hook_event_name: 'SessionStart',
      source: 'resume',
      thread_id: 'codex-thread-b',
      id: 'not-the-session-id',
    })).toMatchObject({
      state: 'done',
      providerSessionId: 'codex-thread-b',
      sessionSource: 'resume',
      sessionTransition: true,
    });
    expect(buildProviderHookPayload('codex', {
      hook_event_name: 'SessionStart',
      source: 'compact',
      thread_id: 'codex-thread-b',
    })).toBeNull();
  });
});

describe('provider hook runtime', () => {
  it('creates project-local Claude settings and Codex home without touching user config', () => {
    const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-hooks-'));
    tempDirs.push(stateDir);
    const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-home-'));
    tempDirs.push(userHome);
    fs.writeFileSync(path.join(userHome, 'config.toml'), 'model = "test"\n');
    fs.writeFileSync(path.join(userHome, 'hooks.json'), JSON.stringify({ hooks: { UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'user-hook' }] }] } }));
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = userHome;
    try {
      const runtime = prepareProviderHookRuntime(stateDir, process.execPath);
      expect(runtime?.claudeSettingsPath).toBeTruthy();
      expect(runtime?.codexHomePath).toBeTruthy();
      const script = fs.readFileSync(runtime!.scriptPath, 'utf8');
      expect(script).toContain('isClaudeSessionTransition');
      expect(script).toContain('isCodexSessionTransition');
      expect(script).toContain('sessionTransition');
      const claude = JSON.parse(fs.readFileSync(runtime!.claudeSettingsPath!, 'utf8'));
      expect(claude.hooks.SessionStart).toHaveLength(1);
      const codex = JSON.parse(fs.readFileSync(path.join(runtime!.codexHomePath!, 'hooks.json'), 'utf8'));
      expect(codex.hooks.SessionStart).toHaveLength(1);
      expect(codex.hooks.SessionEnd).toHaveLength(1);
      expect(codex.hooks.UserPromptSubmit).toHaveLength(2);
      const command = String(codex.hooks.UserPromptSubmit[1].hooks[0].command);
      expect(command).toContain('/bin/sh');
      expect(command).toContain('provider-agent-status.sh');
      expect(fs.readFileSync(path.join(userHome, 'hooks.json'), 'utf8')).toContain('user-hook');
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });
});
