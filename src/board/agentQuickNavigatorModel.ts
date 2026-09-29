import type { BoardAgentStatus } from '@/lib/boardStatus';

export type AgentNavigatorFilter = 'all' | 'active' | 'attention';

export interface AgentNavigatorEntry {
  taskId: string;
  shapeId: string;
  groupId: string;
  groupName: string;
  groupX: number;
  groupY: number;
  x: number;
  y: number;
  name: string;
  project: string;
  workingDir: string;
  model: string;
  agentKind?: string;
  status: BoardAgentStatus;
}

export interface AgentNavigatorGroup {
  id: string;
  name: string;
  entries: AgentNavigatorEntry[];
}

const ACTIVE_STATUSES = new Set<BoardAgentStatus>(['running', 'starting', 'idle', 'pending']);
const ATTENTION_STATUSES = new Set<BoardAgentStatus>(['blocked', 'error']);

function matchesFilter(entry: AgentNavigatorEntry, filter: AgentNavigatorFilter): boolean {
  if (filter === 'active') return ACTIVE_STATUSES.has(entry.status);
  if (filter === 'attention') return ATTENTION_STATUSES.has(entry.status);
  return true;
}

function matchesQuery(entry: AgentNavigatorEntry, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return [
    entry.name,
    entry.project,
    entry.workingDir,
    entry.model,
    entry.agentKind,
    entry.groupName,
  ].some((value) => (value ?? '').toLowerCase().includes(needle));
}

function readingOrder(a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

export function buildAgentNavigatorGroups(
  entries: AgentNavigatorEntry[],
  query: string,
  filter: AgentNavigatorFilter,
): AgentNavigatorGroup[] {
  const visible = entries.filter((entry) => matchesFilter(entry, filter) && matchesQuery(entry, query));
  const groups = new Map<string, AgentNavigatorGroup>();
  for (const entry of visible) {
    const current = groups.get(entry.groupId);
    if (current) current.entries.push(entry);
    else groups.set(entry.groupId, { id: entry.groupId, name: entry.groupName, entries: [entry] });
  }

  const result = [...groups.values()];
  for (const group of result) {
    group.entries.sort((a, b) => readingOrder(a, b) || a.taskId.localeCompare(b.taskId));
  }
  result.sort((a, b) => {
    const firstA = a.entries[0];
    const firstB = b.entries[0];
    const aUngrouped = a.id === 'ungrouped';
    const bUngrouped = b.id === 'ungrouped';
    if (aUngrouped !== bUngrouped) return aUngrouped ? 1 : -1;
    return readingOrder(
      { x: firstA.groupX, y: firstA.groupY },
      { x: firstB.groupX, y: firstB.groupY },
    ) || a.id.localeCompare(b.id);
  });
  return result;
}

export function countAgentNavigatorFilters(entries: AgentNavigatorEntry[]) {
  return {
    all: entries.length,
    active: entries.filter((entry) => ACTIVE_STATUSES.has(entry.status)).length,
    attention: entries.filter((entry) => ATTENTION_STATUSES.has(entry.status)).length,
  };
}
