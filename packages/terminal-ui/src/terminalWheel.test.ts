import { describe, expect, it, vi } from 'vitest';
import {
  consumeTerminalWheel,
  resolveWheelAction,
  shouldForwardWheelToPty,
  wheelLineDelta,
  attachTerminalWheelController,
} from './terminalWheel';

describe('terminal wheel policy', () => {
  it('prefers the Agent page scroll path for alternate screen even if xterm reports mouse tracking', () => {
    const state = {
      mouseTrackingMode: 'any',
      hasScrollback: false,
      bufferType: 'alternate',
    } as const;
    expect(resolveWheelAction(state, -1)).toBe('page-up');
    expect(shouldForwardWheelToPty(state)).toBe(true);
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

  it('does not turn a normal-buffer wheel into PTY mouse input', () => {
    const state = {
      mouseTrackingMode: 'any',
      hasScrollback: false,
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

  it('does not reinterpret a replayed wheel in the capture listener', () => {
    let capture: ((event: WheelEvent) => void) | undefined;
    let custom: ((event: WheelEvent) => boolean) | undefined;
    const root = {
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'wheel') capture = listener as (event: WheelEvent) => void;
      },
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const terminal = {
      element: null,
      rows: 24,
      modes: { mouseTrackingMode: 'any' },
      buffer: { active: { baseY: 0, type: 'alternate' as const } },
      scrollLines: vi.fn(),
      input: vi.fn(),
      focus: vi.fn(),
      attachCustomWheelEventHandler: (handler: (event: WheelEvent) => boolean) => { custom = handler; },
    };
    attachTerminalWheelController(terminal, root);
    const event = {
      deltaY: -32,
      deltaMode: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as WheelEvent & { __bacReplayedTuiWheel?: boolean };
    Object.defineProperty(event, '__bacReplayedTuiWheel', { value: true });

    capture?.(event);

    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(terminal.input).not.toHaveBeenCalled();
    expect(custom?.(event)).toBe(true);
  });

  it('uses PageUp/PageDown for an alternate buffer without mouse tracking', () => {
    let capture: ((event: WheelEvent) => void) | undefined;
    const root = {
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'wheel') capture = listener as (event: WheelEvent) => void;
      },
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const terminal = {
      element: null,
      rows: 24,
      modes: { mouseTrackingMode: 'none' },
      buffer: { active: { baseY: 0, type: 'alternate' as const } },
      scrollLines: vi.fn(),
      input: vi.fn(),
      focus: vi.fn(),
      attachCustomWheelEventHandler: vi.fn(),
    };
    attachTerminalWheelController(terminal, root);
    const event = {
      deltaY: -32,
      deltaMode: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as WheelEvent;

    capture?.(event);

    expect(terminal.input).toHaveBeenCalledWith('\u001b[5~');
    expect(event.preventDefault).toHaveBeenCalled();
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

  it('routes a normal-buffer wheel through xterm scrollLines', () => {
    let capture: ((event: WheelEvent) => void) | undefined;
    const root = {
      addEventListener: (type: string, listener: EventListener) => {
        if (type === 'wheel') capture = listener as (event: WheelEvent) => void;
      },
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const terminal = {
      element: null,
      modes: { mouseTrackingMode: 'none' },
      buffer: { active: { baseY: 20, type: 'normal' as const } },
      scrollLines: vi.fn(),
      input: vi.fn(),
      focus: vi.fn(),
      attachCustomWheelEventHandler: vi.fn(),
    };
    attachTerminalWheelController(terminal, root);
    const event = {
      deltaY: -32,
      deltaMode: 0,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
    } as unknown as WheelEvent;

    capture?.(event);

    expect(terminal.scrollLines).toHaveBeenCalledWith(-2);
    expect(event.preventDefault).toHaveBeenCalled();
  });
});
