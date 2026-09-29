import { describe, expect, it, vi } from 'vitest';
import {
  captureTerminalScrollIntent,
  restoreTerminalScrollIntentAfterOutput,
  restoreTerminalScrollIntentAfterStructure,
} from './terminalScrollIntent';

function terminal(viewportY: number, baseY: number) {
  return {
    buffer: { active: { viewportY, baseY, length: 0, getLine: () => undefined as { translateToString(trimRight: boolean): string } | undefined } },
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
    expect(after.scrollToLine).toHaveBeenCalledWith(12, true);
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
    expect(after.scrollToLine).toHaveBeenCalledWith(32, true);
  });

  it('prefers a logical line marker after structural reflow', () => {
    const before = captureTerminalScrollIntent({
      buffer: {
        active: {
          viewportY: 12,
          baseY: 80,
          getLine: () => ({ translateToString: () => 'stable line' }),
        },
      },
    });
    const after = terminal(0, 100);
    after.buffer.active.length = 101;
    after.buffer.active.getLine = (index: number) => (
      index === 40 ? { translateToString: () => 'stable line' } : undefined
    );
    expect(restoreTerminalScrollIntentAfterStructure(after, before)).toBe(true);
    expect(after.scrollToLine).toHaveBeenCalledWith(40, true);
  });
});
