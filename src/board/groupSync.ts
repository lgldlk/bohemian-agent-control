import type { Editor } from 'tldraw';
import { useSpaceStore, syncActiveGroups } from '@/space/spaceStore';
import { readGroupsFromBoard } from './boardSync';
import { isBoardSpaceSyncReady, setBoardSpaceSyncReady } from './boardSyncState';
import { createRafScheduler } from '@/lib/timing';

/** Project frame membership back into the active board's groups. Does not place cards. */
export function listenBoardGroups(editor: Editor, boardId?: string): () => void {
  const syncStore = createRafScheduler(() => {
    // Only the visible board may write its projection back.
    if (boardId && editor.getCurrentPageId() !== boardId) return;
    useSpaceStore.getState().replaceGroups(readGroupsFromBoard(editor).map((group) => ({
      ...group,
      collapsed: false,
    })), boardId);
  });
  setBoardSpaceSyncReady(false);
  const unsubscribe = editor.store.listen(() => {
    if (!isBoardSpaceSyncReady()) return;
    syncStore.schedule();
  }, { scope: 'document' });
  // Adopting a board must re-project its groups before the next board edit.
  const stopWatchingBoard = useSpaceStore.subscribe(() => {
    if (!boardId) return;
    if (editor.getCurrentPageId() !== boardId) return;
    syncActiveGroups();
  });
  return () => {
    stopWatchingBoard();
    unsubscribe();
    syncStore.cancel();
  };
}
