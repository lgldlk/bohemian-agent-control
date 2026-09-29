/** Preserve a user's pinned viewport while live output is parsed and rendered. */

export interface TerminalScrollIntent {
  pinned: boolean;
  line: number;
  bottomOffset: number;
  marker?: string;
}

export function captureTerminalScrollIntent(terminal: {
  buffer: {
    active: {
      viewportY: number;
      baseY: number;
      getLine?: (index: number) => { translateToString(trimRight: boolean): string } | undefined;
    };
  };
}): TerminalScrollIntent {
  const buffer = terminal.buffer.active;
  const marker = buffer.getLine?.(buffer.viewportY)?.translateToString(true).trim();
  return {
    pinned: buffer.viewportY < buffer.baseY,
    line: buffer.viewportY,
    bottomOffset: Math.max(0, buffer.baseY - buffer.viewportY),
    ...(marker ? { marker } : {}),
  };
}

export function restoreTerminalScrollIntentAfterOutput(
  terminal: {
    buffer: { active: { viewportY: number; baseY: number } };
    scrollToLine(line: number, disableSmoothScroll?: boolean): void;
    syncScrollArea?: () => void;
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
    buffer: {
      active: {
        viewportY: number;
        baseY: number;
        length?: number;
        getLine?: (index: number) => { translateToString(trimRight: boolean): string } | undefined;
      };
    };
    scrollToLine(line: number, disableSmoothScroll?: boolean): void;
    syncScrollArea?: () => void;
  },
  intent: TerminalScrollIntent,
): boolean {
  const buffer = terminal.buffer.active;
  const markerLine = intent.marker && buffer.getLine && buffer.length
    ? findMarkerLine(buffer, intent.marker, intent.line)
    : undefined;
  const target = markerLine ?? Math.max(0, buffer.baseY - intent.bottomOffset);
  return restorePinnedLine(terminal, target, buffer.baseY);
}

function findMarkerLine(
  buffer: {
    length?: number;
    getLine?: (index: number) => { translateToString(trimRight: boolean): string } | undefined;
  },
  marker: string,
  hint: number,
): number | undefined {
  const length = buffer.length ?? 0;
  const start = Math.max(0, hint - 256);
  const end = Math.min(length, hint + 256);
  for (let index = start; index < end; index += 1) {
    if (buffer.getLine?.(index)?.translateToString(true).trim() === marker) return index;
  }
  return undefined;
}

function restorePinnedLine(
  terminal: {
    buffer: { active: { viewportY: number; baseY: number } };
    scrollToLine(line: number, disableSmoothScroll?: boolean): void;
    syncScrollArea?: () => void;
  },
  line: number,
  baseY: number,
): boolean {
  const target = Math.min(Math.max(0, line), Math.max(0, baseY));
  terminal.scrollToLine(target, true);
  // xterm's public scrollToLine uses smooth scrolling. Structural replay and
  // output restoration must settle immediately, otherwise the animation can
  // overwrite a newer wheel gesture on the next frame.
  terminal.syncScrollArea?.();
  return true;
}

