/**
 * Pure board-shell rules shared by the board store and the tldraw page layer.
 *
 * A "board" is a user-visible canvas surface. The tldraw page is its projection;
 * this module owns identity, ordering and name rules so both layers agree without
 * one of them reaching into the other.
 */

import i18n from '@/i18n';

/** tldraw seeds every fresh document with this page id. */
export const FIRST_PAGE_ID = 'page:page';

export interface BoardRecord {
  id: string;
  name: string;
  /** Ascending display order; the tab menu renders by this value. */
  order: number;
  createdAt: number;
}

export const DEFAULT_BOARD_NAME = '主画板';

/**
 * Built-in board name wording.
 *
 * Names are persisted, so the caller resolves them from i18n when a board is
 * created. Generated names are checked in every spelling, so switching language
 * never produces a duplicate name.
 */
export interface BoardNameOptions {
  /** Name for the first, seeded board. */
  defaultName: string;
  /** Builds the name for the n-th generated board. */
  nthName: (n: number) => string;
}

/** Resolves the wording from the active language. */
export function boardNameOptions(): BoardNameOptions {
  return {
    defaultName: i18n.t('board.switcher.defaultName'),
    nthName: (n) => i18n.t('board.switcher.nthName', { n }),
  };
}

/** Every known spelling of "board n", so a language switch cannot collide. */
function isGeneratedBoardName(name: string, n: number): boolean {
  return name === `画板 ${n}` || name === `Board ${n}`;
}

/** The lowest number not already claimed in either language. */
function nextFreeBoardNumber(boards: readonly BoardRecord[]): number {
  for (let n = 1; n <= boards.length + BOARD_MAX_COUNT + 1; n += 1) {
    if (!boards.some((board) => isGeneratedBoardName(board.name, n))) return n;
  }
  return boards.length + BOARD_MAX_COUNT + 2;
}

export const BOARD_NAME_MAX = 40;
export const BOARD_MAX_COUNT = 64;

export function clampBoardName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, BOARD_NAME_MAX);
}

/** Returns '' when the name cannot be used by another board. */
export function normalizeBoardName(raw: string, boards: readonly BoardRecord[], exceptId?: string): string {
  const name = clampBoardName(raw);
  if (!name) return '';
  const taken = boards.some((board) => board.id !== exceptId && board.name === name);
  return taken ? '' : name;
}

/** Next unused "board n", numbered across every known spelling. */
export function nextBoardName(
  boards: readonly BoardRecord[],
  options: BoardNameOptions = boardNameOptions(),
): string {
  const n = nextFreeBoardNumber(boards);
  const name = options.nthName(n);
  // A user may have already claimed exactly this wording.
  return boards.some((board) => board.name === name) ? options.nthName(Date.now()) : name;
}

export function nextBoardOrder(boards: readonly BoardRecord[]): number {
  return boards.reduce((max, board) => Math.max(max, board.order), -1) + 1;
}

export function sortBoards(boards: readonly BoardRecord[]): BoardRecord[] {
  return [...boards].sort((a, b) => (a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order));
}

function isBoardRecord(value: unknown): value is BoardRecord {
  if (value === null || typeof value !== 'object') return false;
  const board = value as Record<string, unknown>;
  return (
    typeof board.id === 'string' &&
    board.id.length > 0 &&
    typeof board.name === 'string' &&
    board.name.length > 0 &&
    typeof board.order === 'number' &&
    Number.isFinite(board.order) &&
    typeof board.createdAt === 'number' &&
    Number.isFinite(board.createdAt)
  );
}

/**
 * The page list is the projection that decides which boards still exist.
 * Boards are dropped when their page is gone, appended when a page has no record,
 * and re-ordered so the array always has denser order keys than the input.
 */
export function reconcileBoards(
  boards: readonly BoardRecord[],
  pageIds: readonly string[],
  options: BoardNameOptions = boardNameOptions(),
): BoardRecord[] {
  const known = new Map<string, BoardRecord>();
  for (const board of boards) {
    if (!isBoardRecord(board) || known.has(board.id)) continue;
    known.set(board.id, board);
  }

  const next: BoardRecord[] = [];
  for (const pageId of pageIds) {
    const existing = known.get(pageId);
    if (existing) {
      next.push(existing);
      known.delete(pageId);
    } else {
      next.push({
        id: pageId,
        name: pageId === FIRST_PAGE_ID ? options.defaultName : nextBoardName(next, options),
        order: nextBoardOrder(next),
        createdAt: Date.now(),
      });
    }
  }
  // A board whose page was deleted never survives reconciliation.
  return sortBoards(next).map((board, index) => ({ ...board, order: index }));
}

/** Used on load: seed the shell from whatever persisted page list exists. */
export function boardsFromPageIds(
  pageIds: readonly string[],
  options: BoardNameOptions = boardNameOptions(),
): BoardRecord[] {
  const ordered = pageIds.length > 0 ? [...pageIds] : [FIRST_PAGE_ID];
  const boards: BoardRecord[] = [];
  for (const pageId of ordered) {
    boards.push({
      id: pageId,
      name: pageId === FIRST_PAGE_ID ? options.defaultName : nextBoardName(boards, options),
      order: boards.length,
      createdAt: Date.now(),
    });
  }
  return boards;
}
