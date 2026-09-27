import type { TerminalSnapshot } from '@bohemian/terminal-protocol';

/** Replay the PTY snapshot unchanged, including an alternate-screen TUI frame. */
export function buildTerminalSnapshotReplay(snapshot: TerminalSnapshot): string {
  const prefix = snapshot.truncated ? '\x1bc\x1b[90m[older scrollback truncated]\x1b[0m\r\n' : '';
  const body = snapshot.alternateScreen
    ? `${snapshot.scrollbackAnsi ?? ''}${snapshot.data}`
    : snapshot.data;
  return `${prefix}${body}`;
}
