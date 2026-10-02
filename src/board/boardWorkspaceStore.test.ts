import { beforeEach, describe, expect, it } from 'vitest';
import { useBoardWorkspaceStore } from './boardWorkspaceStore';
import { FIRST_PAGE_ID } from './boardWorkspaceModel';
import { setActiveBoardIdReader, spaceIdList, syncActiveGroups, useSpaceStore } from '@/space/spaceStore';

const OWN_BOARDS = ['page:one', 'page:two'];

/** Point both stores at a test double instead of persisted browser state. */
function resetStores() {
  useBoardWorkspaceStore.setState({
    boards: OWN_BOARDS.map((id, index) => ({
      id,
      name: index === 0 ? '主画板' : `画板 ${index}`,
      order: index,
      createdAt: 0,
    })),
    activeBoardId: OWN_BOARDS[0],
    hydrated: true,
  });
  useSpaceStore.setState({
    groupsByBoard: {},
    groups: [],
  });
  setActiveBoardIdReader(() => useBoardWorkspaceStore.getState().activeBoardId);
  syncActiveGroups();
}

beforeEach(resetStores);

describe('board workspace store', () => {
  it('always keeps at least one board', () => {
    useBoardWorkspaceStore.getState().removeBoard(OWN_BOARDS[1]);
    expect(useBoardWorkspaceStore.getState().boards).toHaveLength(1);
    // The last board cannot be removed.
    expect(useBoardWorkspaceStore.getState().removeBoard(OWN_BOARDS[0])).toBe('');
    expect(useBoardWorkspaceStore.getState().boards).toHaveLength(1);
  });

  it('removes a board and re-homes the active board', () => {
    useBoardWorkspaceStore.getState().setActiveBoard(OWN_BOARDS[1]);
    const nextActive = useBoardWorkspaceStore.getState().removeBoard(OWN_BOARDS[1]);
    expect(nextActive).toBe(OWN_BOARDS[0]);
    expect(useBoardWorkspaceStore.getState().activeBoardId).toBe(OWN_BOARDS[0]);
    expect(useBoardWorkspaceStore.getState().boards.map((b) => b.id)).toEqual([OWN_BOARDS[0]]);
  });

  it('refuses a duplicate or empty name', () => {
    const store = useBoardWorkspaceStore.getState();
    expect(store.renameBoard(OWN_BOARDS[1], '  ')).toBe(false);
    expect(store.renameBoard(OWN_BOARDS[1], '主画板')).toBe(false);
    expect(useBoardWorkspaceStore.getState().boards[1].name).toBe('画板 1');
  });

  it('renames and persists the new name', () => {
    expect(useBoardWorkspaceStore.getState().renameBoard(OWN_BOARDS[1], '  项目 A ')).toBe(true);
    expect(useBoardWorkspaceStore.getState().boards[1].name).toBe('项目 A');
  });

  it('creates a board and activates it', () => {
    const id = useBoardWorkspaceStore.getState().createBoard();
    expect(useBoardWorkspaceStore.getState().activeBoardId).toBe(id);
    expect(useBoardWorkspaceStore.getState().boards.map((b) => b.id)).toContain(id);
  });

  it('reorders boards by display order', () => {
    useBoardWorkspaceStore.getState().reorderBoard(OWN_BOARDS[1], 0);
    expect(useBoardWorkspaceStore.getState().boards.map((b) => b.id)).toEqual([
      OWN_BOARDS[1],
      OWN_BOARDS[0],
    ]);
    expect(useBoardWorkspaceStore.getState().boards.map((b) => b.order)).toEqual([0, 1]);
  });

  it('drops boards whose page disappeared, keeping known names', () => {
    useBoardWorkspaceStore.getState().syncPages([OWN_BOARDS[0]]);
    const boards = useBoardWorkspaceStore.getState().boards;
    expect(boards.map((b) => b.id)).toEqual([OWN_BOARDS[0]]);
    expect(boards[0].name).toBe('主画板');
  });

  it('reconciles the seeded first page to the current board id', () => {
    useBoardWorkspaceStore.setState({
      boards: [{ id: 'page:stale', name: '主画板', order: 0, createdAt: 0 }],
      activeBoardId: 'page:stale',
      hydrated: false,
    });
    useBoardWorkspaceStore.getState().syncPages([FIRST_PAGE_ID]);
    const state = useBoardWorkspaceStore.getState();
    expect(state.boards.map((b) => b.id)).toEqual([FIRST_PAGE_ID]);
    expect(state.activeBoardId).toBe(FIRST_PAGE_ID);
  });

  it('keeps the persisted active board when its page still exists', () => {
    useBoardWorkspaceStore.setState({
      boards: [
        { id: FIRST_PAGE_ID, name: '主画板', order: 0, createdAt: 0 },
        { id: 'page:b', name: '项目 A', order: 1, createdAt: 0 },
      ],
      activeBoardId: 'page:b',
      hydrated: false,
    });
    // tldraw restores its own current page, but the shell must not follow it on boot.
    useBoardWorkspaceStore.getState().syncPages([FIRST_PAGE_ID, 'page:b']);

    const state = useBoardWorkspaceStore.getState();
    expect(state.activeBoardId).toBe('page:b');
    expect(state.hydrated).toBe(true);
  });

  it('marks the shell hydrated after the first page sync', () => {
    useBoardWorkspaceStore.setState({ hydrated: false });
    useBoardWorkspaceStore.getState().syncPages([FIRST_PAGE_ID, 'page:b']);
    expect(useBoardWorkspaceStore.getState().hydrated).toBe(true);
  });
});

describe('per-board group isolation', () => {
  it('keeps each board groups separate', () => {
    const space = useSpaceStore.getState();
    space.addToGroup('agent-a', undefined, OWN_BOARDS[0]);
    space.addToGroup('agent-b', undefined, OWN_BOARDS[1]);

    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[0]] ?? [])).toEqual(['agent-a']);
    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[1]] ?? [])).toEqual(['agent-b']);
  });

  it('lets the same Agent live on two boards at once', () => {
    const space = useSpaceStore.getState();
    space.addToGroup('agent-a', undefined, OWN_BOARDS[0]);
    space.addToGroup('agent-a', undefined, OWN_BOARDS[1]);

    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[0]] ?? [])).toEqual(['agent-a']);
    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[1]] ?? [])).toEqual(['agent-a']);
  });

  it('removing an Agent from one board leaves the other untouched', () => {
    const space = useSpaceStore.getState();
    space.addToGroup('agent-a', undefined, OWN_BOARDS[0]);
    space.addToGroup('agent-a', undefined, OWN_BOARDS[1]);
    space.removeFromSpace('agent-a', OWN_BOARDS[0]);

    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[0]] ?? [])).toEqual([]);
    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[1]] ?? [])).toEqual(['agent-a']);
  });

  it('scopes createGroup to the named board', () => {
    const groupId = useSpaceStore.getState().createGroup('项目 A', OWN_BOARDS[1]);
    expect(groupId).not.toBe('');
    expect(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[1]]?.some((g) => g.id === groupId)).toBe(true);
    expect(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[0]]).toBeUndefined();
  });

  it('routes the default mutation to the active board', () => {
    useBoardWorkspaceStore.getState().setActiveBoard(OWN_BOARDS[1]);
    setActiveBoardIdReader(() => useBoardWorkspaceStore.getState().activeBoardId);
    useSpaceStore.getState().addToGroup('agent-z');

    expect(spaceIdList(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[1]] ?? [])).toEqual(['agent-z']);
    expect(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[0]]).toBeUndefined();
  });

  it('forgets every group owned by a deleted board', () => {
    useSpaceStore.getState().addToGroup('agent-a', undefined, OWN_BOARDS[0]);
    useSpaceStore.getState().forgetBoard(OWN_BOARDS[0]);
    expect(useSpaceStore.getState().groupsByBoard[OWN_BOARDS[0]]).toBeUndefined();
  });

  it('projects the active board groups onto the convenience field', () => {
    useSpaceStore.getState().addToGroup('agent-a', undefined, OWN_BOARDS[0]);
    useBoardWorkspaceStore.getState().setActiveBoard(OWN_BOARDS[1]);
    syncActiveGroups();
    expect(useSpaceStore.getState().groups).toEqual([]);

    useBoardWorkspaceStore.getState().setActiveBoard(OWN_BOARDS[0]);
    syncActiveGroups();
    expect(spaceIdList(useSpaceStore.getState().groups)).toEqual(['agent-a']);
  });
});
