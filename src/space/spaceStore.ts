import { create } from 'zustand';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';

export interface SpaceGroup {
  id: string;
  name: string;
  taskIds: string[];
  collapsed: boolean;
}

export interface SpaceStoreState {
  groups: SpaceGroup[];
  addToGroup: (taskId: string, groupId?: string) => void;
  removeFromSpace: (taskId: string) => void;
  rebindTaskId: (fromTaskId: string, toTaskId: string) => void;
  clearSpace: () => void;
  createGroup: (name: string) => string;
  renameGroup: (id: string, name: string) => void;
  deleteGroup: (id: string) => void;
  moveToGroup: (taskId: string, groupId: string) => void;
  toggleGroup: (id: string) => void;
  replaceGroups: (groups: SpaceGroup[]) => void;
}

const V2_KEY = 'bohemian-agent-control:space:v2';

function defaultGroup(taskIds: string[] = []): SpaceGroup {
  return { id: 'default', name: '未分组', taskIds, collapsed: false };
}

function isValidGroups(v: unknown): v is SpaceGroup[] {
  if (!Array.isArray(v)) return false;
  return v.every(
    (g) =>
      g !== null &&
      typeof g === 'object' &&
      typeof (g as SpaceGroup).id === 'string' &&
      typeof (g as SpaceGroup).name === 'string' &&
      Array.isArray((g as SpaceGroup).taskIds) &&
      (g as SpaceGroup).taskIds.every((t) => typeof t === 'string') &&
      typeof (g as SpaceGroup).collapsed === 'boolean',
  );
}

function loadGroups(): SpaceGroup[] {
  return readLocalJson(V2_KEY, (value) =>
    isValidGroups(value) && value.length > 0 ? value : null, () => [defaultGroup()]);
}

function save(groups: SpaceGroup[]): void {
  writeLocalJson(V2_KEY, groups);
}

/** 把 taskId 先从所有组删掉(防重复),再放进目标组 */
function insertInto(groups: SpaceGroup[], taskId: string, groupId?: string): SpaceGroup[] {
  const cleaned = groups.map((g) => ({ ...g, taskIds: g.taskIds.filter((t) => t !== taskId) }));
  if (cleaned.length === 0) {
    return [{ ...defaultGroup(), taskIds: [taskId] }];
  }
  const targetIdx = groupId != null ? cleaned.findIndex((g) => g.id === groupId) : 0;
  const idx = targetIdx >= 0 ? targetIdx : 0;
  return cleaned.map((g, i) => (i === idx ? { ...g, taskIds: [...g.taskIds, taskId] } : g));
}

export const useSpaceStore = create<SpaceStoreState>()((set, get) => ({
  groups: loadGroups(),

  addToGroup: (taskId, groupId) => {
    const next = insertInto(get().groups, taskId, groupId);
    set({ groups: next });
    save(next);
  },

  removeFromSpace: (taskId) => {
    const next = get().groups.map((g) => ({ ...g, taskIds: g.taskIds.filter((t) => t !== taskId) }));
    set({ groups: next });
    save(next);
  },

  rebindTaskId: (fromTaskId, toTaskId) => {
    if (!fromTaskId || !toTaskId || fromTaskId === toTaskId) return;
    const next = get().groups.map((g) => {
      const ids = g.taskIds.map((id) => (id === fromTaskId ? toTaskId : id));
      return { ...g, taskIds: [...new Set(ids)] };
    });
    set({ groups: next });
    save(next);
  },

  clearSpace: () => {
    const cur = get().groups;
    const next = cur.length === 0 ? [defaultGroup()] : cur.map((g) => ({ ...g, taskIds: [] }));
    set({ groups: next });
    save(next);
  },

  createGroup: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const id = `g-${Date.now().toString(36)}`;
    const next = [...get().groups, { id, name: trimmed, taskIds: [], collapsed: false }];
    set({ groups: next });
    save(next);
    return id;
  },

  renameGroup: (id, name) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const next = get().groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g));
    set({ groups: next });
    save(next);
  },

  deleteGroup: (id) => {
    const cur = get().groups;
    const target = cur.find((g) => g.id === id);
    if (!target) return;
    const rest = cur.filter((g) => g.id !== id);
    let next: SpaceGroup[];
    if (rest.length === 0) {
      next = [defaultGroup([...target.taskIds])];
    } else {
      next = rest.map((g, i) => (i === 0 ? { ...g, taskIds: [...g.taskIds, ...target.taskIds] } : g));
    }
    set({ groups: next });
    save(next);
  },

  moveToGroup: (taskId, groupId) => {
    const next = insertInto(get().groups, taskId, groupId);
    set({ groups: next });
    save(next);
  },

  toggleGroup: (id) => {
    const next = get().groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g));
    set({ groups: next });
    save(next);
  },

  replaceGroups: (incoming) => {
    const prev = get().groups;
    const collapsed = new Map(prev.map((g) => [g.id, g.collapsed]));
    const next: SpaceGroup[] = incoming.map((g) => ({
      ...g,
      collapsed: collapsed.get(g.id) ?? false,
    }));
    const incomingIds = new Set(next.map((g) => g.id));
    for (const g of prev) {
      if (g.id === 'default') continue;
      if (incomingIds.has(g.id)) continue;
      if (g.taskIds.length === 0) next.push(g);
    }
    if (groupsEqual(prev, next)) return;
    set({ groups: next });
    save(next);
  },
}));

function groupsEqual(a: SpaceGroup[], b: SpaceGroup[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (g, i) =>
      g.id === b[i].id &&
      g.name === b[i].name &&
      g.collapsed === b[i].collapsed &&
      g.taskIds.length === b[i].taskIds.length &&
      g.taskIds.every((t, j) => t === b[i].taskIds[j])
  );
}

/** 按组顺序摊平为 id 列表 */
export function spaceIdList(groups: SpaceGroup[]): string[] {
  return groups.flatMap((g) => g.taskIds);
}
