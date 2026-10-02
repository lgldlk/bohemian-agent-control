import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, useValue, type TLPageId } from 'tldraw';
import { useBoardWorkspaceStore } from './boardWorkspaceStore';
import { applyPagePlan, isPlanEmpty, planPageChanges } from './boardPagePlan';
import { setActiveBoardIdReader, syncActiveGroups, useSpaceStore } from '@/space/spaceStore';

/**
 * Projects the board shell onto tldraw pages.
 *
 * tldraw owns shapes, frames, connectors, cameras and the document store; the
 * board shell owns names and which board is active. This hook is the only place
 * that translates between them, so neither side reaches into the other.
 */
export function useBoardPages(): void {
  const editor = useEditor();
  const syncingRef = useRef(false);

  useEffect(() => {
    setActiveBoardIdReader(() => useBoardWorkspaceStore.getState().activeBoardId);
    syncActiveGroups();

    /** Board shell -> pages: create missing pages, adopt names, follow active board. */
    const pushToPages = () => {
      const { boards, activeBoardId } = useBoardWorkspaceStore.getState();
      syncingRef.current = true;
      try {
        const plan = planPageChanges(boards, editor.getPages().map((page) => ({
          id: page.id as string,
          name: page.name,
        })));
        if (!isPlanEmpty(plan)) {
          applyPagePlan({
            getPages: () => editor.getPages().map((page) => ({ id: page.id as string, name: page.name })),
            createPage: ({ id, name }) => {
              editor.createPage({ id: id as TLPageId, name });
            },
            renamePage: (id, name) => editor.renamePage(id as TLPageId, name),
          }, plan);
        }
        if (editor.getCurrentPageId() !== activeBoardId && editor.getPage(activeBoardId as TLPageId)) {
          editor.setCurrentPage(activeBoardId as TLPageId);
        }
      } finally {
        syncingRef.current = false;
      }
    };

    /** Pages -> board shell: adopt the page list and the page the user opened. */
    const adoptFromPages = () => {
      if (syncingRef.current) return;
      // Read hydration BEFORE syncing: syncPages sets it. On the first pass the
      // persisted active board wins over whatever page tldraw restored.
      const alreadyHydrated = useBoardWorkspaceStore.getState().hydrated;
      const pageIds = editor.getPages().map((page) => page.id as string);
      useBoardWorkspaceStore.getState().syncPages(pageIds);
      if (alreadyHydrated) {
        useBoardWorkspaceStore.getState().setActiveBoard(editor.getCurrentPageId() as string);
      }
      syncActiveGroups();
    };

    adoptFromPages();
    pushToPages();

    const stopStore = useBoardWorkspaceStore.subscribe(() => {
      pushToPages();
      syncActiveGroups();
    });
    const stopPages = editor.store.listen(adoptFromPages, { scope: 'document' });
    return () => {
      stopStore();
      stopPages();
    };
  }, [editor]);
}

/**
 * Page mutation helpers. Each one pairs the tldraw page operation with its board
 * record so the two never drift, and none of them touch PTYs or Agent sessions.
 *
 * The returned object is rebuilt when the language changes, because callers read
 * it inside menus that stay open across a language switch.
 */
export function useBoardPageActions() {
  const editor = useEditor();
  const { i18n } = useTranslation();
  return useValue('board page actions', () => ({
    switchBoard: (boardId: string) => {
      useBoardWorkspaceStore.getState().setActiveBoard(boardId);
      if (editor.getPage(boardId as TLPageId)) editor.setCurrentPage(boardId as TLPageId);
      syncActiveGroups();
    },
    createBoard: (name?: string) => {
      const id = useBoardWorkspaceStore.getState().createBoard(name);
      const board = useBoardWorkspaceStore.getState().boards.find((item) => item.id === id);
      if (!editor.getPage(id as TLPageId)) {
        editor.createPage({ id: id as TLPageId, name: board?.name });
      }
      editor.setCurrentPage(id as TLPageId);
      syncActiveGroups();
      return id;
    },
    renameBoard: (boardId: string, name: string) => {
      const ok = useBoardWorkspaceStore.getState().renameBoard(boardId, name);
      if (!ok) return false;
      const board = useBoardWorkspaceStore.getState().boards.find((item) => item.id === boardId);
      if (board && editor.getPage(boardId as TLPageId)) editor.renamePage(boardId as TLPageId, board.name);
      return true;
    },
    /**
     * Deletes the board projection only. Agents, PTYs and sessions live outside
     * a board, so removing a board must never stop or delete them.
     */
    deleteBoard: (boardId: string) => {
      const store = useBoardWorkspaceStore.getState();
      if (store.boards.length <= 1) return false;
      const target = store.boards.find((board) => board.id === boardId);
        if (!target) return false;
      // Legacy groups are only needed until this page's cards have been
      // materialized. Removing the old board record prevents stale membership
      // from recreating deleted cards on a later render.
      useSpaceStore.getState().forgetBoard(boardId);
      useBoardWorkspaceStore.getState().removeBoard(boardId);
      if (editor.getPage(boardId as TLPageId)) editor.deletePage(boardId as TLPageId);
      const nextActive = useBoardWorkspaceStore.getState().activeBoardId;
      if (editor.getPage(nextActive as TLPageId)) editor.setCurrentPage(nextActive as TLPageId);
      syncActiveGroups();
      return true;
    },
    /** Copies the page content, then re-points the new board at its own page. */
    duplicateBoard: (boardId: string) => {
      const source = useBoardWorkspaceStore.getState().boards.find((board) => board.id === boardId);
      if (!source) return '';
      if (!editor.getPage(boardId as TLPageId)) return '';
      const id = useBoardWorkspaceStore.getState().createBoard();
      // duplicatePage creates the page itself and adopts the source camera.
      editor.duplicatePage(boardId as TLPageId, id as TLPageId);
      if (!editor.getPage(id as TLPageId)) {
        // Tldraw refused (page cap or readonly): roll the board record back.
        useBoardWorkspaceStore.getState().removeBoard(id);
        return '';
      }
      editor.setCurrentPage(id as TLPageId);
      const board = useBoardWorkspaceStore.getState().boards.find((item) => item.id === id);
      if (board) editor.renamePage(id as TLPageId, board.name);
      syncActiveGroups();
      return id;
    },
  }), [editor, i18n.language]);
}
