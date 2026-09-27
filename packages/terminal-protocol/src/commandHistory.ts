export interface RecordedCommand {
  command: string;
  at: number;
}

export interface CommandBuffer {
  line: string;
  escape: boolean;
  commands: RecordedCommand[];
}

const ANSI_RE = /\u001b(?:\[[0-9;?]*[A-Za-z]|\].*?(?:\u0007|\u001b\\))/g;

export function createCommandBuffer(commands: RecordedCommand[] = [], limit = 200): CommandBuffer {
  return { line: '', escape: false, commands: commands.slice(-limit) };
}

/** Turn raw PTY keystrokes into committed command lines. Escape sequences are ignored. */
export function pushTerminalInput(buffer: CommandBuffer, data: string, at = Date.now(), limit = 200): void {
  for (const ch of data) {
    if (buffer.escape) {
      if ((ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z') || ch === '~') buffer.escape = false;
      continue;
    }
    if (ch === '\u001b') {
      buffer.escape = true;
      continue;
    }
    if (ch === '\r' || ch === '\n') {
      const command = buffer.line.trim().slice(0, 500);
      buffer.line = '';
      if (!command) continue;
      buffer.commands.push({ command, at });
      if (buffer.commands.length > limit) buffer.commands.splice(0, buffer.commands.length - limit);
      continue;
    }
    if (ch === '\u007f' || ch === '\b') {
      buffer.line = buffer.line.slice(0, -1);
      continue;
    }
    if (ch === '\u0003' || ch === '\u0015') {
      buffer.line = '';
      continue;
    }
    if (ch >= ' ') buffer.line += ch;
  }
}

export function stripTerminalText(value: string): string {
  return value.replace(ANSI_RE, '').replace(/\u001b./g, '');
}

export function searchTerminalText(value: string, query: string, limit: number): string[] {
  const needle = query.trim().toLowerCase();
  if (!needle || limit <= 0) return [];
  const hits: string[] = [];
  for (const line of stripTerminalText(value).split(/\r?\n/)) {
    const excerpt = line.trim();
    if (!excerpt || !excerpt.toLowerCase().includes(needle)) continue;
    hits.push(excerpt.slice(0, 240));
    if (hits.length >= limit) break;
  }
  return hits;
}
