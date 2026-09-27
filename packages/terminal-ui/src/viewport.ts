/** Viewport helpers for xterm-on-canvas: keep scroll unless the user moved it. */

export interface TerminalScrollProbe {
  hasOffsetParent: boolean;
  offsetHeight: number;
  scrollTop: number;
  viewportY: number;
  msSinceUserInput: number;
}

const USER_SCROLL_GRACE_MS = 250;

/** True when a scroll event is a layout glitch, not a user gesture. */
export function isCorruptTerminalScroll(probe: TerminalScrollProbe): boolean {
  if (!probe.hasOffsetParent || probe.offsetHeight < 2) return true;
  const jumpedToTop = probe.scrollTop <= 1 && probe.viewportY > 2;
  return jumpedToTop && probe.msSinceUserInput > USER_SCROLL_GRACE_MS;
}

export function isViewportAtBottom(viewportY: number, baseY: number): boolean {
  return viewportY >= baseY;
}

export function clampViewportLine(line: number, baseY: number): number {
  if (!Number.isFinite(line) || line < 0) return 0;
  return Math.min(Math.floor(line), Math.max(0, baseY));
}
