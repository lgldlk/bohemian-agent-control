import { useCallback, useRef } from 'react';
import { useEditor, useIsEditing, type TLShapeId } from 'tldraw';
import type { PointerEvent, WheelEvent } from 'react';
import {
  enterShapeEdit,
  exitShapeEdit,
  isolateEvent,
  isolateWheel,
  isChromeTarget,
} from './boardNodeEvents';

export interface BoardNodeEventPolicy {
  /** 进入 tldraw editing，内容区可输入/滚动。 */
  editable?: boolean;
  /** 内容区 pointer 拦住画布手势。 */
  captureBody?: boolean;
  /** 内容区滚轮不缩放画布。 */
  captureWheel?: boolean;
  /** 标题栏/按钮等铬条选择器；命中后不退出编辑。 */
  chromeSelector?: string;
  focus?: () => void;
  blur?: () => void;
  /** 激活动作：任务卡打开终端，终端则等同进入编辑。 */
  onActivate?: () => void;
}

export interface BoardNodeEvents {
  editing: boolean;
  isolate: typeof isolateEvent;
  isolateWheel: typeof isolateWheel;
  isolateClick: (event: { stopPropagation(): void }, action?: () => void) => void;
  onChromePointerDown: (event: PointerEvent) => void;
  onBodyPointerDown: (event: PointerEvent) => void;
  onBodyWheel: (event: WheelEvent) => void;
  onActivate: () => void;
  onDeactivate: () => void;
}

/** 所有画布节点事件的父级 hook。具体节点只提供 policy。 */
export function useBoardNodeEvents(
  shapeId: TLShapeId | null,
  policy: BoardNodeEventPolicy = {},
): BoardNodeEvents {
  const editor = useEditor();
  const editing = useIsEditing(shapeId ?? ('shape:none' as TLShapeId));
  const policyRef = useRef(policy);
  policyRef.current = policy;

  const isolate = useCallback(isolateEvent, []);
  const isolateWheelEvent = useCallback(isolateWheel, []);

  const isolateClick = useCallback((event: { stopPropagation(): void }, action?: () => void) => {
    event.stopPropagation();
    action?.();
  }, []);

  const onActivate = useCallback(() => {
    const next = policyRef.current;
    if (shapeId && next.editable) enterShapeEdit(editor, shapeId, next.focus);
    next.onActivate?.();
  }, [editor, shapeId]);

  const onDeactivate = useCallback(() => {
    const next = policyRef.current;
    if (next.editable) exitShapeEdit(editor, next.blur);
    else next.blur?.();
  }, [editor]);

  const onChromePointerDown = useCallback(
    (event: PointerEvent) => {
      const next = policyRef.current;
      if (next.chromeSelector && isChromeTarget(event.target, next.chromeSelector)) return;
      onDeactivate();
    },
    [onDeactivate],
  );

  const onBodyPointerDown = useCallback(
    (event: PointerEvent) => {
      if (policyRef.current.captureBody) isolateEvent(event);
      onActivate();
    },
    [onActivate],
  );

  const onBodyWheel = useCallback((event: WheelEvent) => {
    if (policyRef.current.captureWheel) isolateWheel(event);
  }, []);

  return {
    editing: shapeId ? editing : false,
    isolate,
    isolateWheel: isolateWheelEvent,
    isolateClick,
    onChromePointerDown,
    onBodyPointerDown,
    onBodyWheel,
    onActivate,
    onDeactivate,
  };
}
