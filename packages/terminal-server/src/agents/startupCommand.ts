import { injectClaudeSettings } from './claude/startup';
import { injectCodexHome } from './codex/startup';
import { ensurePiFullscreen, injectPiExtension } from './pi/startup';

export function providerStartupCommand(
  agentKind: string | undefined,
  command: string,
  paths: { piExtensionPath?: string; claudeSettingsPath?: string; codexHomePath?: string },
): string {
  if (agentKind === 'pi') return ensurePiFullscreen(injectPiExtension(command, paths.piExtensionPath) ?? command);
  if (agentKind === 'claude-code') return injectClaudeSettings(command, paths.claudeSettingsPath) ?? command;
  if (agentKind === 'codex') return injectCodexHome(command, paths.codexHomePath) ?? command;
  return command;
}

/** Restart a bound provider by resuming its conversation, not by starting a new one. */
export function providerResumeCommand(agentKind: string | undefined, sessionId: string | undefined): string | undefined {
  if (!sessionId || sessionId.startsWith('pending-')) return undefined;
  const id = quoteShell(sessionId);
  if (agentKind === 'codex') return `codex resume ${id}`;
  if (agentKind === 'claude-code') return `claude --resume ${id}`;
  if (agentKind === 'pi') return `pi --session ${id}`;
  return undefined;
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
