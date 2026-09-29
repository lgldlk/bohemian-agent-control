import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from 'tldraw';
import { focusPendingTaskShape, focusTaskShape, setBoardEditor } from './boardEditor';

describe('pending board focus', () => {
  afterEach(() => setBoardEditor(null));

  it('focuses an Agent card after board sync creates it', () => {
    const shapes: Array<Record<string, unknown>> = [];
    const select = vi.fn();
    const zoomToSelection = vi.fn();
    const editor = {
      getCurrentPageShapes: () => shapes,
      select,
      zoomToSelection,
    } as unknown as Editor;

    setBoardEditor(editor);
    focusTaskShape('pending-agent');
    expect(select).not.toHaveBeenCalled();

    shapes.push({
      id: 'shape:pending-agent',
      type: 'task-card',
      props: { taskId: 'pending-agent' },
    });

    expect(focusPendingTaskShape(editor)).toBe(true);
    expect(select).toHaveBeenCalledWith('shape:pending-agent');
    expect(zoomToSelection).toHaveBeenCalledWith({ animation: { duration: 300 } });
    expect(focusPendingTaskShape(editor)).toBe(false);
  });
});
