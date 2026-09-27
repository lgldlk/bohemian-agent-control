import { describe, expect, it, vi } from 'vitest';
import {
  captureTerminalScrollIntent,
  restoreTerminalScrollIntentAfterOutput,
  restoreTerminalScrollIntentAfterStructure,
} from './terminalScrollIntent';

function terminal(viewportY: number, baseY: number) {
  return {
    buffer: { active: { viewportY, baseY } },
    scrollToLine: vi.fn(),
    scrollLines: vi.fn(),
  };
}

describe('terminal scroll intent', () => {
  it('captures a pinned viewport instead of treating it as a generic scroll event', () => {
    expect(captureTerminalScrollIntent(terminal(12, 80))).toEqual({ pinned: true, line: 12, bottomOffset: 68 });
    expect(captureTerminalScrollIntent(terminal(80, 80))).toEqual({ pinned: false, line: 80, bottomOffset: 0 });
  });

  it('restores a pinned line after output followed the bottom', () => {
    const before = captureTerminalScrollIntent(terminal(12, 80));
    const after = terminal(100, 100);
    expect(restoreTerminalScrollIntentAfterOutput(after, before)).toBe(true);
    expect(after.scrollToLine).toHaveBeenCalledWith(12);
  });

  it('does not fight a newer user scroll during output parsing', () => {
    const before = captureTerminalScrollIntent(terminal(12, 80));
    const after = terminal(20, 100);
    expect(restoreTerminalScrollIntentAfterOutput(after, before)).toBe(false);
    expect(after.scrollToLine).not.toHaveBeenCalled();
  });

  it('restores the pinned bottom offset after a structural reflow', () => {
    const before = captureTerminalScrollIntent(terminal(12, 80));
    const after = terminal(0, 100);
    expect(restoreTerminalScrollIntentAfterStructure(after, before)).toBe(true);
    expect(after.scrollToLine).toHaveBeenCalledWith(32);
  });
});
