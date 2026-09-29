import { createShapeId, type Editor, type TLParentId, type TLShapeId } from 'tldraw';
import type { Task } from '@/types';
import { expandFrameToChildren } from './groupFrameEditor';
import { focusTaskShape as focusTaskShapeOnEditor } from './boardSync';
import { taskToCardProps } from './TaskCardShape';

let boardEditor: Editor | null = null;
let pendingFocusTaskId: string | null = null;
const editorListeners = new Set<() => void>();

export function setBoardEditor(editor: Editor | null): void {
  boardEditor = editor;
  if (editor) focusPendingTaskShape(editor);
  editorListeners.forEach((listener) => listener());
}

export function subscribeBoardEditor(listener: () => void): () => void {
  editorListeners.add(listener);
  return () => editorListeners.delete(listener);
}

export function getBoardEditor(): Editor | null {
  return boardEditor;
}

export function focusTaskShape(taskId: string): void {
  pendingFocusTaskId = taskId;
  const editor = boardEditor;
  if (editor) focusPendingTaskShape(editor);
}

/** 卡片可能由下一轮 board sync 才创建；成功聚焦前保留最后一次请求。 */
export function focusPendingTaskShape(editor: Editor): boolean {
  if (!pendingFocusTaskId) return false;
  if (!focusTaskShapeOnEditor(editor, pendingFocusTaskId)) return false;
  pendingFocusTaskId = null;
  return true;
}

export function createTaskCardShape(
  taskId: string,
  x: number,
  y: number,
  task?: Task,
  parentId?: TLParentId,
): void {
  const editor = boardEditor;
  if (!editor) return;
  editor.createShapes([{
    id: createShapeId(),
    type: 'task-card',
    x,
    y,
    ...(parentId ? { parentId } : {}),
    props: taskToCardProps(task, taskId),
  }]);
  if (parentId) expandFrameToChildren(editor, parentId as TLShapeId);
}
