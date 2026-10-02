import { describe, expect, it } from 'vitest';
import {
  boardsFromPageIds,
  clampBoardName,
  FIRST_PAGE_ID,
  nextBoardName,
  normalizeBoardName,
  reconcileBoards,
  type BoardNameOptions,
  type BoardRecord,
} from './boardWorkspaceModel';
import { nextBoardOrder } from './boardWorkspaceModel';

/** Fixed wording so these tests never depend on the runtime language. */
const NAMES: BoardNameOptions = {
  defaultName: '主画板',
  nthName: (n) => `画板 ${n}`,
};

const board = (id: string, name: string, order: number): BoardRecord => ({
  id,
  name,
  order,
  createdAt: 0,
});

describe('clampBoardName', () => {
  it('trims and collapses whitespace', () => {
    expect(clampBoardName('  项目   A  ')).toBe('项目 A');
  });

  it('caps the stored length', () => {
    expect(clampBoardName('x'.repeat(80))).toHaveLength(40);
  });

  it('rejects a whitespace-only name', () => {
    expect(clampBoardName('   ')).toBe('');
  });
});

describe('normalizeBoardName', () => {
  it('rejects a name already used by another board', () => {
    const boards = [board('page:a', '项目 A', 0), board('page:b', '项目 B', 1)];
    expect(normalizeBoardName('项目 A', boards)).toBe('');
  });

  it('allows a board to keep its own name', () => {
    const boards = [board('page:a', '项目 A', 0)];
    expect(normalizeBoardName('项目 A', boards, 'page:a')).toBe('项目 A');
  });
});

describe('nextBoardName', () => {
  it('skips names already in use', () => {
    const boards = [board('a', '画板 1', 0), board('b', '画板 2', 1)];
    expect(nextBoardName(boards, NAMES)).toBe('画板 3');
  });

  it('fills the first gap rather than appending past it', () => {
    const used = [board('a', '画板 1', 0), board('b', '画板 3', 1)];
    expect(nextBoardName(used, NAMES)).toBe('画板 2');
  });

  it('follows the active language wording', () => {
    const en: BoardNameOptions = { defaultName: 'Main board', nthName: (n) => `Board ${n}` };
    expect(nextBoardName([], en)).toBe('Board 1');
  });

  it('does not reuse a number taken in the other language', () => {
    // Boards created before a language switch must still block their number.
    const used = [board('a', 'Board 1', 0)];
    expect(nextBoardName(used, NAMES)).toBe('画板 2');
  });
});

describe('nextBoardOrder', () => {
  it('appends after the highest order', () => {
    expect(nextBoardOrder([board('a', 'a', 0), board('b', 'b', 7)])).toBe(8);
  });

  it('starts at zero for an empty shell', () => {
    expect(nextBoardOrder([])).toBe(0);
  });
});

describe('reconcileBoards', () => {
  it('seeds the default name for the untouched first page', () => {
    expect(reconcileBoards([], [FIRST_PAGE_ID], NAMES)).toEqual([
      { id: FIRST_PAGE_ID, name: '主画板', order: 0, createdAt: expect.any(Number) },
    ]);
  });

  it('keeps a known board name and order', () => {
    const existing = [board(FIRST_PAGE_ID, '我的主画板', 0)];
    const [result] = reconcileBoards(existing, [FIRST_PAGE_ID], NAMES);
    expect(result.name).toBe('我的主画板');
  });

  it('drops a board whose page no longer exists', () => {
    const existing = [board(FIRST_PAGE_ID, '主画板', 0), board('page:gone', '已删除', 1)];
    expect(reconcileBoards(existing, [FIRST_PAGE_ID], NAMES).map((b) => b.id)).toEqual([FIRST_PAGE_ID]);
  });

  it('appends a page that has no board record yet', () => {
    const existing = [board(FIRST_PAGE_ID, '主画板', 0)];
    const result = reconcileBoards(existing, [FIRST_PAGE_ID, 'page:new'], NAMES);
    expect(result.map((b) => b.id)).toEqual([FIRST_PAGE_ID, 'page:new']);
    expect(result[1].name).toBe('画板 1');
  });

  it('re-densifies order keys after removals', () => {
    const existing = [board(FIRST_PAGE_ID, '主画板', 0), board('page:b', '项目 A', 5)];
    const result = reconcileBoards(existing, [FIRST_PAGE_ID, 'page:b'], NAMES);
    expect(result.map((b) => b.order)).toEqual([0, 1]);
  });

  it('ignores malformed persisted records', () => {
    const existing = [{ id: 'page:x', name: 'ok', order: 0, createdAt: 0 }, { id: 42 }] as unknown as BoardRecord[];
    expect(reconcileBoards(existing, [FIRST_PAGE_ID], NAMES).map((b) => b.id)).toEqual([FIRST_PAGE_ID]);
  });
});

describe('boardsFromPageIds', () => {
  it('names the first page as the default board', () => {
    const boards = boardsFromPageIds([FIRST_PAGE_ID], NAMES);
    expect(boards).toHaveLength(1);
    expect(boards[0].name).toBe('主画板');
    expect(boards[0].order).toBe(0);
  });

  it('gives later pages distinct generated names', () => {
    const boards = boardsFromPageIds([FIRST_PAGE_ID, 'page:two', 'page:three'], NAMES);
    const names = boards.map((b) => b.name);
    expect(new Set(names).size).toBe(3);
    expect(names[0]).toBe('主画板');
  });

  it('seeds a default board when no page exists yet', () => {
    expect(boardsFromPageIds([], NAMES).map((b) => b.id)).toEqual([FIRST_PAGE_ID]);
  });
});
