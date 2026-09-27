import { describe, expect, it } from 'vitest';
import { cellFromCanvasPoint } from './terminalSelection';

describe('terminal text selection', () => {
  const rect = { left: 100, top: 200, width: 200, height: 100 };

  it('uses the painted canvas box, so a zoomed click stays on the visible cell', () => {
    expect(cellFromCanvasPoint(100, 200, rect, 10, 5)).toEqual({ col: 0, row: 0 });
    expect(cellFromCanvasPoint(150, 250, rect, 10, 5)).toEqual({ col: 2, row: 2 });
    expect(cellFromCanvasPoint(299, 299, rect, 10, 5)).toEqual({ col: 9, row: 4 });
  });

  it('uses the renderer cell size so the last row does not slip up by one', () => {
    const tall = { left: 0, top: 0, width: 100, height: 48 };
    expect(cellFromCanvasPoint(10, 40, tall, 10, 2, {
      width: 10,
      height: 20,
      offsetWidth: 100,
      offsetHeight: 40,
    })).toEqual({ col: 1, row: 1 });
  });

  it('ignores clicks outside the canvas', () => {
    expect(cellFromCanvasPoint(99, 250, rect, 10, 5)).toBeNull();
    expect(cellFromCanvasPoint(150, 301, rect, 10, 5)).toBeNull();
  });
});
