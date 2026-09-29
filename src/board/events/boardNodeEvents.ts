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

/**
 * ShapeUtil.onClick runs before tldraw finishes its pointing_shape transition.
 * Entering edit mode synchronously there is immediately overwritten by the
 * pointer-up transition back to idle, so defer until the click has settled.
 */
export function enterSelectedShapeEditAfterClick(
  editor: Editor,
  shapeId: TLShapeId,
  focus?: () => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
) {
  schedule(() => {
    const selectedShapeIds = editor.getSelectedShapeIds();
    if (selectedShapeIds.length !== 1 || selectedShapeIds[0] !== shapeId) return;
    enterShapeEdit(editor, shapeId, focus);
  });
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

/** Terminal body events do not reach tldraw because xterm owns pointer input. */
export function handleExitedTerminalDoubleClick(
  event: { preventDefault(): void; stopPropagation(): void },
  status: string | undefined,
  runtimePhase: string | undefined,
  restart: () => void,
): boolean {
  if (status !== 'exited' && runtimePhase !== 'exited') return false;
  event.preventDefault();
  event.stopPropagation();
  restart();
  return true;
}

/** ShapeUtil.onDoubleClick 的统一入口：按节点类型分发。 */
export function handleShapeDoubleClick(
  editor: Editor,
  shape: { id: TLShapeId; type: string; props: object },
  reopenTerminal?: (shapeId: TLShapeId) => void,
) {
  if (shape.type === 'terminal') {
    const status = 'status' in shape.props && typeof shape.props.status === 'string'
      ? shape.props.status
      : undefined;
    if (status === 'exited' && reopenTerminal) {
      reopenTerminal(shape.id);
      return;
    }
    enterShapeEdit(editor, shape.id);
    return;
  }
  if (shape.type === 'task-card' && 'taskId' in shape.props && typeof shape.props.taskId === 'string') {
    openTaskTerminal(shape.props.taskId);
  }
}
