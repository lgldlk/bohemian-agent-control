import type { TerminalSnapshot } from '@bohemian/terminal-protocol';

const ENTER_ALTERNATE = /\u001b\[\?(?:1049|1047|47)h/g;
const HAS_ENTER_ALTERNATE = /\u001b\[\?(?:1049|1047|47)h/;
const MAX_NORMAL_REPLAY_CHARS = 320_000;

/**
 * xterm only keeps a bounded number of rows, so replaying the server's full
 * byte transcript wastes time once it is larger than the visible scrollback.
 * Keep a line boundary and reset SGR state when clipping the normal buffer.
 */
function clipNormalReplay(value: string): string {
  if (value.length <= MAX_NORMAL_REPLAY_CHARS) return value;
  const boundary = value.indexOf('\n', value.length - MAX_NORMAL_REPLAY_CHARS);
  const start = boundary >= 0 && boundary + 1 < value.length
    ? boundary + 1
    : Math.max(0, value.length - MAX_NORMAL_REPLAY_CHARS);
  return `\u001b[0m${value.slice(start)}`;
}

/**
 * The server keeps a bounded transcript while an alternate-screen TUI is
 * running. Only the bytes after the most recent alternate-screen entry can
 * affect the current frame; replaying older frames is pure parser work.
 */
function currentAlternateFrame(value: string): string {
  let lastEntry = -1;
  for (const match of value.matchAll(ENTER_ALTERNATE)) {
    lastEntry = match.index ?? lastEntry;
  }
  return lastEntry >= 0 ? value.slice(lastEntry) : value;
}

/**
 * Replay a snapshot in the same buffer order xterm uses live:
 * normal history first, then the alternate frame, with a deterministic mode
 * and SGR boundary around the replay.
 */
export function buildTerminalSnapshotReplay(snapshot: TerminalSnapshot): string {
  const prefix = snapshot.truncated ? '\x1bc\x1b[90m[older scrollback truncated]\x1b[0m\r\n' : '';
  const normalPrologue = '\u001b[?1049l\u001b[0m';
  if (!snapshot.alternateScreen) {
    return `${prefix}${normalPrologue}${clipNormalReplay(snapshot.data)}\u001b[0m`;
  }
  const frame = currentAlternateFrame(snapshot.data);
  const framePrologue = HAS_ENTER_ALTERNATE.test(frame) ? '' : '\u001b[?1049h';
  return `${prefix}${normalPrologue}${clipNormalReplay(snapshot.scrollbackAnsi ?? '')}${framePrologue}${frame}\u001b[0m`;
}
