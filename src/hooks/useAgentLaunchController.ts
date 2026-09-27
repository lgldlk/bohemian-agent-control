import { useCallback, useEffect } from 'react';
import type { Task } from '@/types';
import { pendingToTask, useWorkspaceStore } from '@/workspace/workspaceStore';
import { useSpaceStore } from '@/space/spaceStore';
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
  const addToGroup = useSpaceStore((state) => state.addToGroup);
  const rebindTaskId = useSpaceStore((state) => state.rebindTaskId);

  useEffect(() => {
    for (const thread of pending) {
      const live = [...getBoardTerminalInfos().values()].find((info) => info.launchId === thread.id);
      const bound = live ? boundSessionId(live) : undefined;
      const task = bound ? tasks.find((item) => item.id === bound) : findPendingTask(thread, tasks);
      const nextId = bound || task?.id;
      if (!nextId || isBoardSpaceSyncReady()) continue;
      removePending(thread.id);
      rebindTaskId(thread.id, nextId);
    }
  }, [pending, tasks, removePending, rebindTaskId]);

  const start = useCallback((cwd: string, groupId?: string, agentKind?: string) => {
    const thread = addPending(cwd, agentKind);
    setLastUsed(cwd);
    addToGroup(thread.id, groupId);
    openTerminalForTask(thread.id, pendingToTask(thread));
    return thread.id;
  }, [addPending, addToGroup, openTerminalForTask, setLastUsed]);

  return { pending, start };
}
