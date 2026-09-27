import { describe, expect, it, vi } from 'vitest';
import {
  consumeTerminalWheel,
  resolveWheelAction,
  shouldForwardWheelToPty,
  wheelLineDelta,
} from './terminalWheel';

describe('terminal wheel policy', () => {
  it('prefers the Agent page scroll path for alternate screen even if xterm reports mouse tracking', () => {
    expect(resolveWheelAction({
      mouseTrackingMode: 'any',
      hasScrollback: false,
      bufferType: 'alternate',
    }, -1)).toBe('page-up');
  });

  it('does not forward wheel when there is no TUI tracking', () => {
    expect(shouldForwardWheelToPty({ mouseTrackingMode: 'none', hasScrollback: true })).toBe(false);
  });

  it('uses PageUp/PageDown for an alternate TUI without mouse tracking', () => {
    const state = { mouseTrackingMode: 'none', hasScrollback: false, bufferType: 'alternate' as const };
    expect(resolveWheelAction(state, -1)).toBe('page-up');
    expect(resolveWheelAction(state, 1)).toBe('page-down');
  });

  it('uses local xterm history before mouse reports or page keys', () => {
    const state = {
      mouseTrackingMode: 'any',
      hasScrollback: true,
      bufferType: 'normal' as const,
    };
    expect(resolveWheelAction(state, -1)).toBe('local-scroll');
    expect(shouldForwardWheelToPty(state)).toBe(false);
  });

  it('turns a trackpad wheel into local lines', () => {
    expect(wheelLineDelta({ deltaY: -48, deltaMode: 0 })).toBe(-3);
    expect(wheelLineDelta({ deltaY: 3, deltaMode: 1 })).toBe(3);
    expect(wheelLineDelta({ deltaY: 0, deltaMode: 0 })).toBe(0);
  });

  it('scrolls locally once for a normal buffer', () => {
    const terminal = { scrollLines: vi.fn() };
    const event = {
      deltaY: -32,
      deltaMode: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as WheelEvent;
    consumeTerminalWheel(terminal, event);
    consumeTerminalWheel(terminal, event);
    expect(terminal.scrollLines).toHaveBeenCalledTimes(1);
    expect(terminal.scrollLines).toHaveBeenCalledWith(-2);
  });
});
