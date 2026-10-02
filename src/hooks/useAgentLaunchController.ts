import { useCallback, useEffect } from 'react';
import type { Task } from '@/types';
import { pendingToTask, useWorkspaceStore } from '@/workspace/workspaceStore';
import { useBoardWorkspaceStore } from '@/board/boardWorkspaceStore';
import { findPendingTask } from '@/domain/taskReconciliation';
import { getBoardTerminalInfos } from '@/board/terminalActivity';
import { isBoardSpaceSyncReady } from '@/board/boardSyncState';
import { boundSessionId } from '@/domain/terminalIdentity';


export type AgentLaunchPhase = 'pending' | 'bound' | 'failed';

export function useAgentLaunchController(
  tasks: Task[],
  openTerminalForTask: (taskId: string, taskOverride?: Task) => void,
) {
  const pending = useWorkspaceStore((state) => state.pending);
  const addPending = useWorkspaceStore((state) => state.addPending);
  const removePending = useWorkspaceStore((state) => state.removePending);
  const setLastUsed = useWorkspaceStore((state) => state.setLastUsed);

  useEffect(() => {
    let cancelled = false;
    async function reconcilePendingThreads(): Promise<void> {
      for (const thread of pending) {
        const live = [...getBoardTerminalInfos().values()].find((info) => info.launchId === thread.id);
        const bound = live ? boundSessionId(live) : undefined;
        const task = bound ? tasks.find((item) => item.id === bound) : findPendingTask(thread, tasks);
        const nextId = bound || task?.id;
        if (!nextId || nextId.startsWith('pending-') || !isBoardSpaceSyncReady()) continue;
        removePending(thread.id);
        if (cancelled) return;
      }
    }
    void reconcilePendingThreads();
    return () => {
      cancelled = true;
    };
  }, [pending, tasks, removePending]);

  const start = useCallback(async (cwd: string, groupId?: string, agentKind?: string): Promise<void> => {
    const boardId = useBoardWorkspaceStore.getState().activeBoardId;
    const thread = addPending(cwd, agentKind, boardId);
    setLastUsed(cwd);
    try {
      const board = await import('@/board/boardEditor');
      const editor = await board.waitForBoardEditorPage(boardId);
      const task = pendingToTask(thread);
      const frame = groupId && groupId !== 'default'
        ? (await import('@/board/boardShapes')).findFrameByGroupId(editor, groupId)
        : undefined;
      if (groupId && groupId !== 'default' && !frame) {
        throw new Error('The selected group is no longer available on this board.');
      }

      if (frame) {
        const { FRAME_PAD, FRAME_TITLE } = await import('@/board/groupFrame');
        board.createTaskCardShape(thread.id, FRAME_PAD, FRAME_TITLE + FRAME_PAD, task, frame.id);
      } else {
        const { TASK_CARD_H, TASK_CARD_W } = await import('@/board/TaskCardShape');
        const viewport = editor.getViewportPageBounds();
        board.createTaskCardShape(
          thread.id,
          viewport.x + (viewport.w - TASK_CARD_W) / 2,
          viewport.y + (viewport.h - TASK_CARD_H) / 2,
          task,
        );
      }
      board.focusTaskShape(thread.id);
      openTerminalForTask(thread.id, task);
    } catch (error) {
      removePending(thread.id);
      throw error;
    }
  }, [addPending, openTerminalForTask, removePending, setLastUsed]);

  return { pending, start };
}
