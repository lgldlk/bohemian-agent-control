import * as fs from 'node:fs';
import { CLAUDE_HOOK_EVENTS } from './status';

export function writeClaudeHookSettings(settingsPath: string, command: string): string {
  const hooks: Record<string, unknown[]> = {};
  for (const event of CLAUDE_HOOK_EVENTS) {
    hooks[event.name] = [{
      ...(event.matcher ? { matcher: event.matcher } : {}),
      hooks: [{ type: 'command', command, timeout: 10 }],
    }];
  }
  writePrivate(settingsPath, JSON.stringify({ hooks }, null, 2));
  return settingsPath;
}

function writePrivate(file: string, content: string): void {
  fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
}
