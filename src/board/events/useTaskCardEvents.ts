import { useCallback } from 'react';
import type { TLShapeId } from 'tldraw';
import { openTaskTerminal } from './boardNodeEvents';
import { useBoardNodeEvents } from './useBoardNodeEvents';

/** 任务卡节点事件：父级 BoardNodeEvents + 打开终端。 */
export function useTaskCardEvents(shapeId: TLShapeId, taskId: string) {
  const onActivate = useCallback(() => {
    openTaskTerminal(taskId);
  }, [taskId]);

  const node = useBoardNodeEvents(shapeId, {
    chromeSelector: 'button, select',
    onActivate,
  });
  const { isolateClick } = node;

  const onOpenClick = useCallback(
    (event: { stopPropagation(): void }) => {
      isolateClick(event, onActivate);
    },
    [isolateClick, onActivate],
  );

  const onOpenDoubleClick = useCallback(
    (event: { stopPropagation(): void }) => {
      isolateClick(event);
    },
    [isolateClick],
  );

  return { ...node, openTerminal: onActivate, onOpenClick, onOpenDoubleClick };
}
