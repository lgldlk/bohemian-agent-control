import { describe, expect, it } from 'vitest';
import { createBoardPluginEventBus } from './events';

describe('board plugin event bus', () => {
  it('isolates listeners and unsubscribes cleanly', () => {
    const bus = createBoardPluginEventBus();
    const received: string[] = [];
    const stop = bus.subscribe((event) => {
      received.push(event.type);
    });
    bus.subscribe(() => {
      throw new Error('broken plugin listener');
    });

    bus.emit({ type: 'selection-changed', shapeIds: [] });
    stop();
    bus.emit({ type: 'shape-deleted', shapeIds: [] });

    expect(received).toEqual(['selection-changed']);
  });
});
