import { describe, expect, it } from 'vitest';
import { applyTerminalSelection, cellFromScreenPoint } from './terminalSelection';

describe('terminal text selection', () => {
  const rect = { left: 100, top: 200, width: 200, height: 100 };

  it('uses the painted canvas box, so a zoomed click stays on the visible cell', () => {
    expect(cellFromScreenPoint(100, 200, rect, 10, 5)).toEqual({ col: 0, row: 0 });
    expect(cellFromScreenPoint(150, 250, rect, 10, 5)).toEqual({ col: 2, row: 2 });
    expect(cellFromScreenPoint(299, 299, rect, 10, 5)).toEqual({ col: 9, row: 4 });
  });

  it('uses the renderer cell size so the last row does not slip up by one', () => {
    const tall = { left: 0, top: 0, width: 100, height: 48 };
    expect(cellFromScreenPoint(10, 40, tall, 10, 2, {
      width: 10,
      height: 20,
      offsetWidth: 100,
      offsetHeight: 40,
    })).toEqual({ col: 1, row: 1 });
  });

  it('writes the same row that was hit instead of applying a visual bias', () => {
    const model = {
      selectionStart: undefined as [number, number] | undefined,
      selectionEnd: undefined as [number, number] | undefined,
      selectionStartLength: undefined as number | undefined,
      isSelectAllActive: false,
    };
    let refreshes = 0;
    const terminal = {
      cols: 20,
      rows: 8,
      buffer: { active: { viewportY: 10 } },
      _core: { _selectionService: { _model: model, refresh: () => { refreshes++; } } },
    };

    applyTerminalSelection(terminal, { col: 2, row: 3 }, { col: 7, row: 5 }, terminal.buffer.active.viewportY);

    expect(model.selectionStart).toEqual([2, 13]);
    expect(model.selectionEnd).toEqual([8, 15]);
    expect(model.selectionStartLength).toBe(0);
    expect(refreshes).toBe(1);
  });

  it('keeps a click on the first row on that row', () => {
    const model = {
      selectionStart: undefined as [number, number] | undefined,
      selectionEnd: undefined as [number, number] | undefined,
      selectionStartLength: undefined as number | undefined,
      isSelectAllActive: false,
    };
    const terminal = {
      cols: 20,
      rows: 8,
      buffer: { active: { viewportY: 0 } },
      _core: { _selectionService: { _model: model, refresh: () => {} } },
    };

    applyTerminalSelection(terminal, { col: 0, row: 0 }, { col: 2, row: 0 }, 0);

    expect(model.selectionStart).toEqual([0, 0]);
    expect(model.selectionEnd).toEqual([3, 0]);
  });
  it('ignores clicks outside the canvas', () => {
    expect(cellFromScreenPoint(99, 250, rect, 10, 5)).toBeNull();
    expect(cellFromScreenPoint(150, 301, rect, 10, 5)).toBeNull();
  });
});
