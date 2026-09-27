/** Preserve a user's pinned viewport while live output is parsed and rendered. */

export interface TerminalScrollIntent {
  pinned: boolean;
  line: number;
  bottomOffset: number;
}

export function captureTerminalScrollIntent(terminal: {
  buffer: { active: { viewportY: number; baseY: number } };
}): TerminalScrollIntent {
  const buffer = terminal.buffer.active;
  return {
    pinned: buffer.viewportY < buffer.baseY,
    line: buffer.viewportY,
    bottomOffset: Math.max(0, buffer.baseY - buffer.viewportY),
  };
}

export function restoreTerminalScrollIntentAfterOutput(
  terminal: {
    buffer: { active: { viewportY: number; baseY: number } };
    scrollToLine(line: number): void;
    scrollLines(delta: number): void;
  },
  intent: TerminalScrollIntent,
): boolean {
  if (!intent.pinned) return false;
  const buffer = terminal.buffer.active;
  // Output is allowed to continue while the user is pinned. Restore only when
  // xterm followed output; a newer user scroll owns the viewport.
  if (buffer.viewportY < buffer.baseY) return false;
  return restorePinnedLine(terminal, intent.line, buffer.baseY);
}

export function restoreTerminalScrollIntentAfterStructure(
  terminal: {
    buffer: { active: { viewportY: number; baseY: number } };
    scrollToLine(line: number): void;
    scrollLines(delta: number): void;
  },
  intent: TerminalScrollIntent,
): boolean {
  const buffer = terminal.buffer.active;
  const target = Math.max(0, buffer.baseY - intent.bottomOffset);
  return restorePinnedLine(terminal, target, buffer.baseY);
}

function restorePinnedLine(
  terminal: {
    buffer: { active: { viewportY: number; baseY: number } };
    scrollToLine(line: number): void;
    scrollLines(delta: number): void;
  },
  line: number,
  baseY: number,
): boolean {
  const target = Math.min(Math.max(0, line), Math.max(0, baseY));
  terminal.scrollToLine(target);
  // xterm can leave the native thumb stale when ydisp changes during a write.
  if (target > 0) {
    terminal.scrollLines(-1);
    terminal.scrollLines(1);
  } else if (baseY > 0) {
    terminal.scrollLines(1);
    terminal.scrollLines(-1);
  }
  return true;
}


