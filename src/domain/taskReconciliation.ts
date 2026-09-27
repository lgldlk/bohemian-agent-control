import type { Task } from '@/types';
import type { PendingThread } from '@/workspace/workspaceStore';

export const DELETED_TASK_STORAGE_KEY = 'bohemian-agent-control:deleted-agents:v1';
export const DELETED_TASK_LIMIT = 200;

export function findPendingTask(thread: PendingThread, tasks: Task[]): Task | undefined {
  return tasks
    .filter((task) =>
      task.status !== 'deleted' &&
      task.workingDir === thread.cwd &&
      (!thread.agentKind || task.agentKind === thread.agentKind) &&
      +new Date(task.startTime) >= thread.createdAt - 30_000,
    )
    .sort((a, b) => +new Date(b.startTime) - +new Date(a.startTime))[0];
}

export function toDeletedTask(task: Task): Task {
  return {
    ...task,
    status: 'deleted',
    deletedAt: task.deletedAt ?? new Date(),
  };
}

export function mergeTaskSnapshot(
  previous: Task[],
  fresh: Task[],
  changed: ReadonlySet<string> | null,
): Task[] {
  const freshById = new Map(fresh.map((task) => [task.id, task]));
  const next: Task[] = [];

  for (const old of previous) {
    const current = freshById.get(old.id);
    if (current) {
      const replace = changed === null || changed.has(old.id) || old.status === 'deleted';
      next.push(replace ? current : old);
    } else next.push(old.status === 'deleted' ? old : toDeletedTask(old));
  }

  const previousIds = new Set(previous.map((task) => task.id));
  for (const task of fresh) if (!previousIds.has(task.id)) next.push(task);
  return next;
}

export function loadDeletedTasks(): Task[] {
  try {
    const raw = localStorage.getItem(DELETED_TASK_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((task) => task && typeof task.id === 'string')
      .map((task) => ({
        ...task,
        status: 'deleted' as const,
        startTime: new Date(task.startTime),
        lastActivity: new Date(task.lastActivity),
        deletedAt: task.deletedAt ? new Date(task.deletedAt) : new Date(),
      }))
      .slice(0, DELETED_TASK_LIMIT);
  } catch {
    return [];
  }
}

export function saveDeletedTasks(tasks: Task[]): void {
  try {
    localStorage.setItem(
      DELETED_TASK_STORAGE_KEY,
      JSON.stringify(tasks.filter((task) => task.status === 'deleted').slice(0, DELETED_TASK_LIMIT)),
    );
  } catch {
    /* optional persistence */
  }
}
