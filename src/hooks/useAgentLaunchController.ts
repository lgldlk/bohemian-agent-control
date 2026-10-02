import { useCallback, useEffect } from 'react';
import type { Task } from '@/types';
import { pendingToTask, useWorkspaceStore } from '@/workspace/workspaceStore';
import { useBoardWorkspaceStore } from '@/board/boardWorkspaceStore';
import { findPendingTask } from '@/domain/taskReconciliation';
import { getBoardTerminalInfos } from '@/board/terminalActivity';
import { isBoardSpaceSyncReady } from '@/board/boardSyncState';
import { boundSessionId } from '@/domain/terminalIdentity';
import type { TLPageId } from 'tldraw';

export type AgentLaunchPhase = 'pending' | 'bound' | 'failed';

export function useAgentLaunchController(
  tasks: Task[],
  openTerminalForTask: (taskId: string, taskOverride?: Task) => void,
) {
  const pending = useWorkspaceStore((state) => state.pending);
  const addPending = useWorkspaceStore((state) => state.addPending);
  const removePending = useWorkspaceStore((state) => state.removePending);
  const setLastUsed = useWorkspaceStore((state) => state.setLastUsed);

  async function bindPendingThread(thread: (typeof pending)[number]): Promise<void> {
    const live = [...getBoardTerminalInfos().values()].find((info) => info.launchId === thread.id);
    const bound = live ? boundSessionId(live) : undefined;
    const task = bound ? tasks.find((item) => item.id === bound) : findPendingTask(thread, tasks);
    const nextId = bound || task?.id;
    if (!nextId || !isBoardSpaceSyncReady()) return;

    const editorModule = await import('@/board/boardEditor');
    const editor = editorModule.getBoardEditor();
    const boardId = thread.boardId ?? useBoardWorkspaceStore.getState().activeBoardId;
    const cardId = editor && [...editor.getPageShapeIds(boardId as TLPageId)]
      .map((shapeId) => editor.getShape(shapeId))
      .find((shape) => shape?.type === 'task-card' && (shape.props as { taskId?: string }).taskId === thread.id)?.id;
    if (editor && cardId) {
      editor.updateShapes([{ id: cardId, type: 'task-card', props: { taskId: nextId } }]);
    }
    removePending(thread.id);
  }

  useEffect(() => {
    let cancelled = false;
    async function reconcilePendingThreads(): Promise<void> {
      for (const thread of pending) {
        await bindPendingThread(thread);
        if (cancelled) return;
      }
    }
    void reconcilePendingThreads();
    return () => {
      cancelled = true;
    };
  }, [pending, tasks, removePending]);

  const start = useCallback((cwd: string, groupId?: string, agentKind?: string) => {
    const boardId = useBoardWorkspaceStore.getState().activeBoardId;
    const thread = addPending(cwd, agentKind, boardId);
    setLastUsed(cwd);
    // Load canvas commands only when the user launches an Agent. Create the
    // pending card before starting the PTY so identity binding stays in place.
    void import('@/board/boardEditor').then(async (board) => {
      const editor = board.getBoardEditor();
      if (editor && editor.getCurrentPageId() === boardId) {
        const frame = groupId
          ? (await import('@/board/boardShapes')).findFrameByGroupId(editor, groupId)
          : undefined;
        board.createTaskCardShape(thread.id, 0, 0, pendingToTask(thread), frame?.id ?? editor.getCurrentPageId());
        board.focusTaskShape(thread.id);
      }
      openTerminalForTask(thread.id, pendingToTask(thread));
    });
    return thread.id;
  }, [addPending, openTerminalForTask, setLastUsed]);

  return { pending, start };
}
