const RECENT_MS = 14 * 24 * 60 * 60 * 1000;
const RECENT_CAP = 40;

export function taskMatchesQuery(
  task: { id?: string; name?: string; project?: string; model?: string; workingDir?: string },
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [task.name, task.project, task.model, task.workingDir, task.id].some((value) =>
    (value ?? '').toLowerCase().includes(needle),
  );
}

export function recentOrRunning<T extends { id: string; status: string; lastActivity: Date | string | number }>(
  tasks: T[],
): { items: T[]; clipped: boolean } {
  const running = tasks.filter((task) => task.status === 'running');
  const rest = tasks
    .filter((task) => task.status !== 'running')
    .sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity));
  const recent = rest.filter((task) => Date.now() - +new Date(task.lastActivity) < RECENT_MS);
  const items: T[] = [];
  const seen = new Set<string>();
  for (const task of [...running, ...recent.slice(0, RECENT_CAP), ...rest.slice(0, 20)]) {
    if (seen.has(task.id)) continue;
    seen.add(task.id);
    items.push(task);
  }
  return { items, clipped: items.length < tasks.length };
}
