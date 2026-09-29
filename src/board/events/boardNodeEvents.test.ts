import { describe, expect, it, vi } from 'vitest';
import type { Editor, TLShapeId } from 'tldraw';
import {
  enterSelectedShapeEditAfterClick,
  handleExitedTerminalDoubleClick,
  handleShapeDoubleClick,
} from './boardNodeEvents';

function editorStub(selectedShapeIds: TLShapeId[] = []) {
  return {
    select: vi.fn(),
    setEditingShape: vi.fn(),
    getSelectedShapeIds: vi.fn(() => selectedShapeIds),
  } as unknown as Editor;
}

describe('enterSelectedShapeEditAfterClick', () => {
  it('waits for tldraw click selection to settle before entering input mode', () => {
    const shapeId = 'shape:terminal' as TLShapeId;
    const editor = editorStub([shapeId]);
    let scheduled: FrameRequestCallback | undefined;

    enterSelectedShapeEditAfterClick(editor, shapeId, undefined, (callback) => {
      scheduled = callback;
      return 1;
    });

    expect(editor.setEditingShape).not.toHaveBeenCalled();
    scheduled?.(0);
    expect(editor.select).toHaveBeenCalledWith(shapeId);
    expect(editor.setEditingShape).toHaveBeenCalledWith(shapeId);
  });

  it('does not steal focus when another shape becomes selected', () => {
    const shapeId = 'shape:terminal' as TLShapeId;
    const editor = editorStub(['shape:other' as TLShapeId]);

    enterSelectedShapeEditAfterClick(editor, shapeId, undefined, (callback) => {
      callback(0);
      return 1;
    });

    expect(editor.setEditingShape).not.toHaveBeenCalled();
  });
});

describe('handleExitedTerminalDoubleClick', () => {
  it('restarts from the terminal body when the runtime overlay reports exit', () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const restart = vi.fn();

    expect(handleExitedTerminalDoubleClick(event, 'running', 'exited', restart)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(restart).toHaveBeenCalledOnce();
  });

  it('leaves live terminal double-clicks to xterm', () => {
    const event = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    const restart = vi.fn();

    expect(handleExitedTerminalDoubleClick(event, 'running', 'ready', restart)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.stopPropagation).not.toHaveBeenCalled();
    expect(restart).not.toHaveBeenCalled();
  });
});

describe('handleShapeDoubleClick', () => {
  it('restarts an exited terminal instead of focusing the dead process', () => {
    const editor = editorStub();
    const reopen = vi.fn();
    const shapeId = 'shape:terminal' as TLShapeId;

    handleShapeDoubleClick(editor, {
      id: shapeId,
      type: 'terminal',
      props: { status: 'exited', terminalId: 'terminal-1' },
    }, reopen);

    expect(reopen).toHaveBeenCalledWith(shapeId);
    expect(editor.setEditingShape).not.toHaveBeenCalled();
  });

  it('keeps a running terminal focused without restarting it', () => {
    const editor = editorStub();
    const reopen = vi.fn();
    const shapeId = 'shape:terminal' as TLShapeId;

    handleShapeDoubleClick(editor, {
      id: shapeId,
      type: 'terminal',
      props: { status: 'running', terminalId: 'terminal-1' },
    }, reopen);

    expect(reopen).not.toHaveBeenCalled();
    expect(editor.select).toHaveBeenCalledWith(shapeId);
    expect(editor.setEditingShape).toHaveBeenCalledWith(shapeId);
  });
});
