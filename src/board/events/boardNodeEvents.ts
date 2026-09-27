import type { Editor, TLShapeId } from 'tldraw';
import { stopEventPropagation } from 'tldraw';

/** 画布节点事件的父级原语。ShapeUtil 与 hooks 共用，不依赖 React 生命周期。 */

export function isolateEvent(event: Parameters<typeof stopEventPropagation>[0]) {
  stopEventPropagation(event);
}

export function isolateWheel(event: { stopPropagation(): void }) {
  event.stopPropagation();
}

export function isChromeTarget(target: EventTarget | null, selector: string) {
  return Boolean((target as HTMLElement | null)?.closest?.(selector));
}

export function enterShapeEdit(editor: Editor, shapeId: TLShapeId, focus?: () => void) {
  editor.select(shapeId);
  editor.setEditingShape(shapeId);
  if (focus) requestAnimationFrame(focus);
}

export function exitShapeEdit(editor: Editor, blur?: () => void) {
  blur?.();
  editor.setEditingShape(null);
}

let taskTerminalHandler: (taskId: string) => void = () => {};

export function setTaskTerminalHandler(fn: (taskId: string) => void) {
  taskTerminalHandler = fn;
}

export function openTaskTerminal(taskId: string) {
  taskTerminalHandler(taskId);
}

/** ShapeUtil.onDoubleClick 的统一入口：按节点类型分发。 */
export function handleShapeDoubleClick(
  editor: Editor,
  shape: { id: TLShapeId; type: string; props: object },
) {
  if (shape.type === 'terminal') {
    enterShapeEdit(editor, shape.id);
    return;
  }
  if (shape.type === 'task-card' && 'taskId' in shape.props && typeof shape.props.taskId === 'string') {
    openTaskTerminal(shape.props.taskId);
  }
}
