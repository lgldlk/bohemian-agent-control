import { describe, expect, it, vi } from 'vitest';
import { attachResourceInteractionBoundary } from './resourceInteractionBoundary';

describe('resource interaction boundary', () => {
  it('activates on hover and stops interactive events before tldraw', () => {
    const listeners = new Map<string, EventListener>();
    const element = {
      addEventListener: vi.fn((type: string, listener: EventListener) => listeners.set(type, listener)),
      removeEventListener: vi.fn(),
    } as unknown as HTMLElement;
    const activate = vi.fn();
    const detach = attachResourceInteractionBoundary(element, activate);

    listeners.get('pointerenter')?.({} as Event);
    const wheel = { stopPropagation: vi.fn() } as unknown as Event;
    const pointer = { stopPropagation: vi.fn() } as unknown as Event;
    listeners.get('wheel')?.(wheel);
    listeners.get('pointerdown')?.(pointer);

    expect(activate).toHaveBeenCalledOnce();
    expect(wheel.stopPropagation).toHaveBeenCalledOnce();
    expect(pointer.stopPropagation).toHaveBeenCalledOnce();
    expect(element.addEventListener).toHaveBeenCalledWith('wheel', expect.any(Function), { passive: true });

    detach();
    expect(element.removeEventListener).toHaveBeenCalledWith('pointerenter', activate);
  });
});
