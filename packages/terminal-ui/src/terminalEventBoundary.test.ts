import { describe, expect, it, vi } from 'vitest';
import {
  attachTerminalEventBoundary,
  TERMINAL_OWNED_EVENT_TYPES,
  TERMINAL_STOPPED_EVENT_TYPES,
} from './terminalEventBoundary';

describe('terminal event boundary', () => {
  it('marks every terminal event while preserving global continuation listeners', () => {
    const listeners = new Map<string, EventListener>();
    const markHandled = vi.fn();
    const root = {
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn((type: string, listener: EventListener) => {
        if (listeners.get(type) === listener) listeners.delete(type);
      }),
    };

    const detach = attachTerminalEventBoundary(root, { markHandled });

    expect(root.addEventListener).toHaveBeenCalledTimes(TERMINAL_OWNED_EVENT_TYPES.length);
    for (const type of TERMINAL_OWNED_EVENT_TYPES) {
      const event = {
        type,
        stopPropagation: vi.fn(),
        preventDefault: vi.fn(),
      } as unknown as Event;
      listeners.get(type)?.(event);
      expect(markHandled).toHaveBeenCalledWith(event);
      if (TERMINAL_STOPPED_EVENT_TYPES.has(type)) {
        expect(event.stopPropagation).toHaveBeenCalledOnce();
      } else {
        expect(event.stopPropagation).not.toHaveBeenCalled();
      }
      expect(event.preventDefault).not.toHaveBeenCalled();
    }

    detach();
    expect(root.removeEventListener).toHaveBeenCalledTimes(TERMINAL_OWNED_EVENT_TYPES.length);
    expect(listeners.size).toBe(0);
  });
});
