import type { Editor } from 'tldraw';
import { useSpaceStore } from '@/space/spaceStore';
import { readGroupsFromBoard } from './boardSync';
import { isBoardSpaceSyncReady, setBoardSpaceSyncReady } from './boardSyncState';
import { createRafScheduler } from '@/lib/timing';

/** Project frame membership back into the space store. Does not place cards. */
export function listenBoardGroups(editor: Editor): () => void {
  const syncStore = createRafScheduler(() => {
    useSpaceStore.getState().replaceGroups(readGroupsFromBoard(editor).map((group) => ({
      ...group,
      collapsed: false,
    })));
  });
  setBoardSpaceSyncReady(false);
  const unsubscribe = editor.store.listen(() => {
    if (!isBoardSpaceSyncReady()) return;
    syncStore.schedule();
  }, { scope: 'document' });
  return () => {
    unsubscribe();
    syncStore.cancel();
  };
}
