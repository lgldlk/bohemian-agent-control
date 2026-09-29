import { useRef } from 'react';
import { createTaskCardShape, focusTaskShape } from '@/board/boardEditor';
import { useSpaceStore } from '@/space/spaceStore';
import type { Task } from '@/types';

/** Board-only operations. Agent launching is owned by useAgentLaunchController. */
export function useBoardOperations(byId: Map<string, Task>) {
  const addToGroup = useSpaceStore((state) => state.addToGroup);
  const dropPointRef = useRef({ x: 120, y: 120 });

  const dropToBoard = (taskId: string, x: number, y: number) => {
    addToGroup(taskId);
    createTaskCardShape(taskId, x, y, byId.get(taskId));
    focusTaskShape(taskId);
  };

  return { dropToBoard, dropPointRef };
}
