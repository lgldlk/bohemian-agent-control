import { create } from 'zustand';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';
import {
  boardsFromPageIds,
  boardNameOptions,
  DEFAULT_BOARD_NAME,
  FIRST_PAGE_ID,
  nextBoardName,
  nextBoardOrder,
  normalizeBoardName,
  reconcileBoards,
  sortBoards,
  type BoardRecord,
} from './boardWorkspaceModel';

/**
 * Board ownership.
 *
 * A board is a projection surface, never an Agent identity. Deleting a board
 * only drops a view: the PTY, the Agent session and the task snapshot are all
 * owned elsewhere and must survive a board removal.
 */

export interface BoardWorkspaceState {
  boards: BoardRecord[];
  activeBoardId: string;
  /** True once the tldraw page list has been observed and reconciled. */
  hydrated: boolean;

  /** Adopt the persisted tldraw page list. Preserves names and order for known pages. */
  syncPages(pageIds: string[]): void;
  setActiveBoard(id: string): void;
  /** Returns the new board id, or '' when the shell already has too many boards. */
  createBoard(name?: string): string;
  renameBoard(id: string, name: string): boolean;
  /** Removes the record only; the caller deletes the page through tldraw. */
  removeBoard(id: string): string;
  reorderBoard(id: string, targetIndex: number): void;
}

const KEY = 'bohemian-agent-control:boards:v1';

interface Persisted {
  boards: BoardRecord[];
  activeBoardId: string;
}

function decode(value: unknown): Persisted | null {
  if (value === null || typeof value !== 'object') return null;
  const parsed = value as Record<string, unknown>;
  if (!Array.isArray(parsed.boards)) return null;
  const boards = parsed.boards.filter((board): board is BoardRecord =>
    board !== null &&
    typeof board === 'object' &&
    typeof (board as BoardRecord).id === 'string' &&
    typeof (board as BoardRecord).name === 'string' &&
    typeof (board as BoardRecord).order === 'number' &&
    typeof (board as BoardRecord).createdAt === 'number',
  );
  if (boards.length === 0) return null;
  return {
    boards: sortBoards(boards).map((board, index) => ({ ...board, order: index })),
    activeBoardId: typeof parsed.activeBoardId === 'string' ? parsed.activeBoardId : boards[0].id,
  };
}

function load(): Persisted {
  return readLocalJson(KEY, decode, () => ({
    boards: boardsFromPageIds([FIRST_PAGE_ID]),
    activeBoardId: FIRST_PAGE_ID,
  }));
}

function persist(boards: BoardRecord[], activeBoardId: string): void {
  writeLocalJson(KEY, { boards, activeBoardId });
}

const initial = load();

export const useBoardWorkspaceStore = create<BoardWorkspaceState>()((set, get) => ({
  boards: initial.boards,
  activeBoardId: initial.boards.some((board) => board.id === initial.activeBoardId)
    ? initial.activeBoardId
    : initial.boards[0].id,
  hydrated: false,

  syncPages: (pageIds) => {
    const cur = get();
    if (pageIds.length === 0) return;
    const boards = reconcileBoards(cur.boards, pageIds);
    const activeBoardId = boards.some((board) => board.id === cur.activeBoardId)
      ? cur.activeBoardId
      : boards[0].id;
    if (cur.hydrated && boardsEqual(boards, cur.boards) && activeBoardId === cur.activeBoardId) return;
    set({ boards, activeBoardId, hydrated: true });
    persist(boards, activeBoardId);
  },

  setActiveBoard: (id) => {
    const cur = get();
    if (!cur.boards.some((board) => board.id === id) || cur.activeBoardId === id) return;
    set({ activeBoardId: id });
    persist(cur.boards, id);
  },

  createBoard: (name) => {
    const cur = get();
    const boards = cur.boards;
    const options = boardNameOptions();
    const proposed = name ? normalizeBoardName(name, boards) : nextBoardName(boards, options);
    const finalName = proposed || nextBoardName(boards, options);
    const id = `page:${crypto.randomUUID()}`;
    const next = [...boards, {
      id,
      name: finalName,
      order: nextBoardOrder(boards),
      createdAt: Date.now(),
    }];
    // The page is created by the page layer; adopt it optimistically so the
    // switcher can highlight the new board before the store event lands.
    set({ boards: next, activeBoardId: id });
    persist(next, id);
    return id;
  },

  renameBoard: (id, name) => {
    const cur = get();
    const finalName = normalizeBoardName(name, cur.boards, id);
    if (!finalName) return false;
    const next = cur.boards.map((board) => (board.id === id ? { ...board, name: finalName } : board));
    set({ boards: next });
    persist(next, cur.activeBoardId);
    return true;
  },

  removeBoard: (id) => {
    const cur = get();
    if (cur.boards.length <= 1) return '';
    const next = cur.boards.filter((board) => board.id !== id);
    if (next.length === cur.boards.length) return '';
    const ordered = next.map((board, index) => ({ ...board, order: index }));
    const activeBoardId = cur.activeBoardId === id ? ordered[0].id : cur.activeBoardId;
    set({ boards: ordered, activeBoardId });
    persist(ordered, activeBoardId);
    return activeBoardId;
  },

  reorderBoard: (id, targetIndex) => {
    const cur = get();
    const from = cur.boards.findIndex((board) => board.id === id);
    if (from < 0) return;
    const clamped = Math.max(0, Math.min(cur.boards.length - 1, targetIndex));
    if (from === clamped) return;
    const moved = [...cur.boards];
    const [board] = moved.splice(from, 1);
    moved.splice(clamped, 0, board);
    const next = moved.map((item, index) => ({ ...item, order: index }));
    set({ boards: next });
    persist(next, cur.activeBoardId);
  },
}));

function boardsEqual(a: BoardRecord[], b: BoardRecord[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((board, index) =>
    board.id === b[index].id &&
    board.name === b[index].name &&
    board.order === b[index].order,
  );
}

/** Current board record, falling back to the first board. */
export function useActiveBoard(): BoardRecord {
  return useBoardWorkspaceStore((state) =>
    state.boards.find((board) => board.id === state.activeBoardId) ?? state.boards[0],
  );
}

export function useActiveBoardId(): string {
  return useBoardWorkspaceStore((state) => state.activeBoardId);
}

/** Current default-board wording, resolved from the active language. */
export function localizedDefaultBoardName(): string {
  return boardNameOptions().defaultName;
}

export { DEFAULT_BOARD_NAME, FIRST_PAGE_ID };
