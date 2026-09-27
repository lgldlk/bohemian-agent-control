import type { Task } from '@/types';

let tasks = new Map<string, Task>();

export function setBoardTasks(next: readonly Task[]): void {
  tasks = new Map(next.map((task) => [task.id, task]));
}

export function getBoardTasks(): ReadonlyMap<string, Task> {
  return tasks;
}
