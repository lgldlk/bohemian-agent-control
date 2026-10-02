import { create } from 'zustand';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';
import { FIRST_PAGE_ID } from '@/board/boardWorkspaceModel';

/**
 * Group ownership, scoped per board.
 *
 * A group is a business grouping of Agents *inside one board*. The same Agent can
 * appear on several boards, so membership must never be a single global list.
 */

export interface SpaceGroup {
  id: string;
  name: string;
  taskIds: string[];
  collapsed: boolean;
}

export type GroupsByBoard = Record<string, SpaceGroup[]>;

export interface SpaceStoreState {
  /** Board id -> groups. A board with no entry is treated as empty. */
  groupsByBoard: GroupsByBoard;
  /** Groups of the board that is currently open. */
  groups: SpaceGroup[];

  addToGroup: (taskId: string, groupId?: string, boardId?: string) => void;
  removeFromSpace: (taskId: string, boardId?: string) => void;
  rebindTaskId: (fromTaskId: string, toTaskId: string, boardId?: string) => void;
  clearSpace: (boardId?: string) => void;
  createGroup: (name: string, boardId?: string) => string;
  renameGroup: (id: string, name: string, boardId?: string) => void;
  deleteGroup: (id: string, boardId?: string) => void;
  moveToGroup: (taskId: string, groupId: string, boardId?: string) => void;
  toggleGroup: (id: string, boardId?: string) => void;
  replaceGroups: (groups: SpaceGroup[], boardId?: string) => void;
  /** Drop everything owned by a deleted board. */
  forgetBoard: (boardId: string) => void;
}

const V3_KEY = 'bohemian-agent-control:space:v3';
const V2_KEY = 'bohemian-agent-control:space:v2';

function defaultGroup(taskIds: string[] = []): SpaceGroup {
  return { id: 'default', name: '未分组', taskIds, collapsed: false };
}

function isValidGroup(g: unknown): g is SpaceGroup {
  return (
    g !== null &&
    typeof g === 'object' &&
    typeof (g as SpaceGroup).id === 'string' &&
    typeof (g as SpaceGroup).name === 'string' &&
    Array.isArray((g as SpaceGroup).taskIds) &&
    (g as SpaceGroup).taskIds.every((t) => typeof t === 'string') &&
    typeof (g as SpaceGroup).collapsed === 'boolean'
  );
}

function isValidGroups(v: unknown): v is SpaceGroup[] {
  return Array.isArray(v) && v.every(isValidGroup);
}

export function normalizePersistedGroups(groups: SpaceGroup[]): SpaceGroup[] {
  const legacyFrameGroups = groups.filter((group) => group.id.startsWith('shape:'));
  if (legacyFrameGroups.length === 0) return groups;

  const kept = groups.filter((group) => !group.id.startsWith('shape:'));
  const assigned = new Set(kept.flatMap((group) => group.taskIds));
  const recovered = [...new Set(legacyFrameGroups.flatMap((group) => group.taskIds))]
    .filter((taskId) => !assigned.has(taskId));
  const defaultIndex = kept.findIndex((group) => group.id === 'default');
  if (defaultIndex < 0) return [defaultGroup(recovered), ...kept];
  return kept.map((group, index) => index === defaultIndex
    ? { ...group, taskIds: [...group.taskIds, ...recovered] }
    : group);
}

function decodeByBoard(value: unknown): GroupsByBoard | null {
  if (value === null || typeof value !== 'object') return null;
  const parsed = value as Record<string, unknown>;
  if (parsed.boards === null || typeof parsed.boards !== 'object') return null;
  const next: GroupsByBoard = {};
  for (const [boardId, groups] of Object.entries(parsed.boards as Record<string, unknown>)) {
    if (!boardId || !isValidGroups(groups) || groups.length === 0) continue;
    next[boardId] = normalizePersistedGroups(groups);
  }
  return next;
}

/**
 * The v1/v2 stores kept one global group list. Adopt it as the first board's
 * groups so an upgrade does not silently empty the user's canvas.
 */
function load(): GroupsByBoard {
  const migrated = readLocalJson(V3_KEY, decodeByBoard, () => null);
  if (migrated) return migrated;

  const legacy = readLocalJson(V2_KEY, (value) =>
    isValidGroups(value) && value.length > 0 ? value : null, () => null);
  if (!legacy) return {};
  const normalized = normalizePersistedGroups(legacy);
  const next: GroupsByBoard = { [FIRST_PAGE_ID]: normalized };
  save(next);
  return next;
}

function save(boards: GroupsByBoard): void {
  writeLocalJson(V3_KEY, { boards });
}

/**
 * Board resolution.
 *
 * The space store must know which board is active without importing board UI or
 * tldraw. The board shell registers a reader once the page list is known; before
 * that, everything belongs to the seeded first page.
 */
let activeBoardIdRead: () => string = () => FIRST_PAGE_ID;

export function setActiveBoardIdReader(reader: () => string): void {
  activeBoardIdRead = reader;
  syncActiveGroups();
}

/** Project the active board's groups onto the `groups` convenience field. */
export function syncActiveGroups(): void {
  const state = useSpaceStore.getState();
  const groups = state.groupsByBoard[activeBoardId()] ?? [];
  if (!groupsEqual(state.groups, groups)) useSpaceStore.setState({ groups });
}

/** The board default mutations currently target. */
export function currentSpaceBoardId(): string {
  return activeBoardId();
}

function activeBoardId(): string {
  return activeBoardIdRead();
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

const initial = load();

export const useSpaceStore = create<SpaceStoreState>()((set, get) => ({
  groupsByBoard: initial,
  groups: initial[FIRST_PAGE_ID] ?? [],

  addToGroup: (taskId, groupId, boardId) => {
    mutate(get, set, boardId, (groups) => insertInto(groups, taskId, groupId));
  },

  removeFromSpace: (taskId, boardId) => {
    mutate(get, set, boardId, (groups) =>
      groups.map((g) => ({ ...g, taskIds: g.taskIds.filter((t) => t !== taskId) })));
  },

  rebindTaskId: (fromTaskId, toTaskId, boardId) => {
    if (!fromTaskId || !toTaskId || fromTaskId === toTaskId) return;
    mutate(get, set, boardId, (groups) => groups.map((g) => {
      const ids = g.taskIds.map((id) => (id === fromTaskId ? toTaskId : id));
      return { ...g, taskIds: [...new Set(ids)] };
    }));
  },

  clearSpace: (boardId) => {
    mutate(get, set, boardId, (groups) =>
      (groups.length === 0 ? [defaultGroup()] : groups.map((g) => ({ ...g, taskIds: [] }))));
  },

  createGroup: (name, boardId) => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    const id = `g-${Date.now().toString(36)}`;
    mutate(get, set, boardId, (groups) => [...groups, { id, name: trimmed, taskIds: [], collapsed: false }]);
    return id;
  },

  renameGroup: (id, name, boardId) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    mutate(get, set, boardId, (groups) => groups.map((g) => (g.id === id ? { ...g, name: trimmed } : g)));
  },

  deleteGroup: (id, boardId) => {
    mutate(get, set, boardId, (groups) => {
      const target = groups.find((g) => g.id === id);
      if (!target) return groups;
      const rest = groups.filter((g) => g.id !== id);
      if (rest.length === 0) return [defaultGroup([...target.taskIds])];
      return rest.map((g, i) => (i === 0 ? { ...g, taskIds: [...g.taskIds, ...target.taskIds] } : g));
    });
  },

  moveToGroup: (taskId, groupId, boardId) => {
    mutate(get, set, boardId, (groups) => insertInto(groups, taskId, groupId));
  },

  toggleGroup: (id, boardId) => {
    mutate(get, set, boardId, (groups) =>
      groups.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)));
  },

  replaceGroups: (incoming, boardId) => {
    const id = boardId || activeBoardId();
    const prev = get().groupsByBoard[id] ?? [];
    const collapsed = new Map(prev.map((g) => [g.id, g.collapsed]));
    const next: SpaceGroup[] = incoming.map((g) => ({
      ...g,
      collapsed: collapsed.get(g.id) ?? false,
    }));
    const incomingIds = new Set(next.map((g) => g.id));
    for (const g of prev) {
      if (g.id === 'default' || g.id.startsWith('shape:')) continue;
      if (incomingIds.has(g.id)) continue;
      if (g.taskIds.length === 0) next.push(g);
    }
    if (groupsEqual(prev, next)) return;
    putGroups(set, id, next);
  },

  forgetBoard: (boardId) => {
    const cur = get();
    if (!(boardId in cur.groupsByBoard)) return;
    const next = { ...cur.groupsByBoard };
    delete next[boardId];
    set({ groupsByBoard: next });
    save(next);
    syncActiveGroups();
  },
}));

function mutate(
  get: () => SpaceStoreState,
  set: (partial: Partial<SpaceStoreState>) => void,
  boardId: string | undefined,
  update: (groups: SpaceGroup[]) => SpaceGroup[],
): void {
  const id = boardId || activeBoardId();
  const state = get();
  // Only the resolved board's own entry may seed a mutation. Falling back to
  // `state.groups` would copy the active board's members onto another board.
  const current = state.groupsByBoard[id] ?? (id === activeBoardId() ? state.groups : []);
  const next = update(current);
  if (groupsEqual(current, next)) return;
  putGroups(set, id, next);
}

function putGroups(
  set: (partial: Partial<SpaceStoreState>) => void,
  boardId: string,
  groups: SpaceGroup[],
): void {
  const state = useSpaceStore.getState();
  const groupsByBoard = { ...state.groupsByBoard, [boardId]: groups };
  set({ groupsByBoard });
  save(groupsByBoard);
  if (boardId === activeBoardId()) useSpaceStore.setState({ groups });
}

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

/** Groups of an arbitrary board. */
export function groupsForBoard(state: SpaceStoreState, boardId: string): SpaceGroup[] {
  return state.groupsByBoard[boardId] ?? [];
}

/** 按组顺序摊平为 id 列表 */
export function spaceIdList(groups: SpaceGroup[]): string[] {
  return groups.flatMap((g) => g.taskIds);
}

export { defaultGroup };
