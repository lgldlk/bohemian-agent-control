import * as fs from 'node:fs';
import * as path from 'node:path';
import { CODEX_HOOK_EVENTS } from './status';

export function writeCodexHookHome(runtimeHome: string, command: string): string {
  const sourceHome = process.env.CODEX_HOME || path.join(process.env.HOME || process.cwd(), '.codex');
  fs.mkdirSync(runtimeHome, { recursive: true, mode: 0o700 });
  if (fs.existsSync(sourceHome)) {
    for (const entry of fs.readdirSync(sourceHome)) {
      if (entry === 'hooks.json') continue;
      const target = path.join(runtimeHome, entry);
      if (fs.existsSync(target) || fs.lstatSync(target, { throwIfNoEntry: false })) continue;
      try {
        fs.symlinkSync(path.join(sourceHome, entry), target, fs.statSync(path.join(sourceHome, entry)).isDirectory() ? 'dir' : 'file');
      } catch {
        // A missing optional Codex resource must not prevent the Agent from starting.
      }
    }
  }
  const hooks: Record<string, unknown[]> = {};
  try {
    const source = JSON.parse(fs.readFileSync(path.join(sourceHome, 'hooks.json'), 'utf8')) as { hooks?: Record<string, unknown[]> };
    Object.assign(hooks, source.hooks ?? {});
  } catch {
    // A missing or invalid user hooks file must not block the provider launch.
  }
  for (const event of CODEX_HOOK_EVENTS) {
    const current = Array.isArray(hooks[event]) ? hooks[event] : [];
    hooks[event] = [...current, { hooks: [{ type: 'command', command, timeout: 10 }] }];
  }
  writePrivate(path.join(runtimeHome, 'hooks.json'), JSON.stringify({ hooks }, null, 2));
  return runtimeHome;
}

function writePrivate(file: string, content: string): void {
  fs.writeFileSync(file, content, { encoding: 'utf8', mode: 0o600 });
}
