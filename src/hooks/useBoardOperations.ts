import { useRef } from 'react';
import { createTaskCardShape, focusTaskShape, getBoardEditor } from '@/board/boardEditor';
import { findTaskShape } from '@/board/boardShapes';
import type { Task } from '@/types';

/** Board-only operations. Agent launching is owned by useAgentLaunchController. */
export function useBoardOperations(byId: Map<string, Task>) {
  const dropPointRef = useRef({ x: 120, y: 120 });

  const dropToBoard = (taskId: string, x: number, y: number) => {
    // Canvas is the membership source of truth: creating the card joins the
    // board, so no side membership list is touched here.
    createTaskCardShape(taskId, x, y, byId.get(taskId));
    focusTaskShape(taskId);
  };

  /** Removes a member by deleting its card from the canvas. */
  const removeTaskCard = (taskId: string) => {
    const editor = getBoardEditor();
    if (!editor) return;
    const shapeId = findTaskShape(editor, taskId);
    if (!shapeId) return;
    editor.deleteShapes([shapeId]);
  };

  return { dropToBoard, removeTaskCard, dropPointRef };
}
