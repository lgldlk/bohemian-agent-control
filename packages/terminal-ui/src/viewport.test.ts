import { describe, expect, it } from 'vitest';
import { clampViewportLine, isCorruptTerminalScroll, isViewportAtBottom } from './viewport';

describe('terminal viewport', () => {
  it('treats hidden or zero-height viewports as corrupt', () => {
    expect(isCorruptTerminalScroll({
      hasOffsetParent: false,
      offsetHeight: 400,
      scrollTop: 80,
      viewportY: 10,
      msSinceUserInput: 1_000,
    })).toBe(true);
    expect(isCorruptTerminalScroll({
      hasOffsetParent: true,
      offsetHeight: 0,
      scrollTop: 80,
      viewportY: 10,
      msSinceUserInput: 1_000,
    })).toBe(true);
  });

  it('ignores a sudden jump to the top without recent user input', () => {
    expect(isCorruptTerminalScroll({
      hasOffsetParent: true,
      offsetHeight: 400,
      scrollTop: 0,
      viewportY: 80,
      msSinceUserInput: 1_000,
    })).toBe(true);
  });

  it('allows the user to scroll to the top', () => {
    expect(isCorruptTerminalScroll({
      hasOffsetParent: true,
      offsetHeight: 400,
      scrollTop: 0,
      viewportY: 80,
      msSinceUserInput: 16,
    })).toBe(false);
  });

  it('keeps ordinary in-place scrolling', () => {
    expect(isCorruptTerminalScroll({
      hasOffsetParent: true,
      offsetHeight: 400,
      scrollTop: 240,
      viewportY: 12,
      msSinceUserInput: 1_000,
    })).toBe(false);
  });

  it('clamps restored lines and detects the sticky bottom', () => {
    expect(isViewportAtBottom(40, 40)).toBe(true);
    expect(isViewportAtBottom(39, 40)).toBe(false);
    expect(clampViewportLine(90, 40)).toBe(40);
    expect(clampViewportLine(-4, 40)).toBe(0);
  });
});
