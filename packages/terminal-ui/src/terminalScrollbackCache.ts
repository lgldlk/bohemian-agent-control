/**
 * Rendered scrollback cache.
 *
 * The PTY snapshot is a truncated raw byte stream. Replaying it after refresh
 * rebuilds the visible TUI screen, not the lines that already scrolled off.
 * This cache is the only owner of that rendered history. It must not consult
 * Agent identity or launch state.
 */

const PREFIX = 'bac-terminal-scrollback:v1:';
// Keep hydration responsive. The server snapshot already contains the current
// screen; this cache only needs a modest tail of rendered normal-buffer lines.
const MAX_CHARS = 120_000;

export interface ScrollbackTerminal {
  rows: number;
  buffer: {
    normal?: {
      length: number;
      baseY: number;
      getLine(index: number): { translateToString(trimRight: boolean): string } | undefined;
    };
    active: {
      length: number;
      baseY: number;
      getLine(index: number): { translateToString(trimRight: boolean): string } | undefined;
    };
  };
}

export function captureRenderedScrollback(terminal: ScrollbackTerminal): string {
  // The normal buffer owns the scrollbar even while a fullscreen program is
  // painting the alternate buffer. Falling back to active keeps this helper
  // useful with the small test doubles used by the package tests.
  const buffer = terminal.buffer.normal ?? terminal.buffer.active;
  const lines: string[] = [];
  const historyEnd = Math.max(0, Math.min(buffer.baseY, buffer.length));
  for (let i = 0; i < historyEnd; i += 1) {
    lines.push(buffer.getLine(i)?.translateToString(true) ?? '');
  }
  return lines.join('\n');
}

export function prependScrollback(history: string, snapshot: string): string {
  const trimmed = history.replace(/\s+$/g, '');
  if (!trimmed) return snapshot;
  const historyBytes = `${trimmed.replace(/\n/g, '\r\n')}\r\n`;
  if (snapshot.startsWith('\u001bc')) return `\u001bc${historyBytes}${snapshot.slice(2)}`;
  return historyBytes + snapshot;
}

export function rememberTerminalScrollback(terminalId: string, text: string): void {
  if (!terminalId || !text.trim() || typeof sessionStorage === 'undefined') return;
  const clipped = text.length > MAX_CHARS ? text.slice(-MAX_CHARS) : text;
  try {
    sessionStorage.setItem(PREFIX + terminalId, clipped);
  } catch {
    /* quota is optional */
  }
}

export function recallTerminalScrollback(terminalId: string): string {
  if (!terminalId || typeof sessionStorage === 'undefined') return '';
  try {
    return sessionStorage.getItem(PREFIX + terminalId) ?? '';
  } catch {
    return '';
  }
}
