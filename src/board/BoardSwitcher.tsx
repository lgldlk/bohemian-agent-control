import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ChevronDown, Copy, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEditor, useValue, type TLPageId } from 'tldraw';
import { useBoardWorkspaceStore } from './boardWorkspaceStore';
import { useBoardPageActions } from './useBoardPages';
import { BOARD_MAX_COUNT } from './boardWorkspaceModel';

interface BoardSwitcherProps {
  /** Notifies the shared header control so the two panels never overlap. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * Board switcher. One entry point in the canvas header that opens a list of
 * boards, so the header stays a fixed width no matter how many boards exist.
 */
export default function BoardSwitcher({ onOpenChange }: BoardSwitcherProps) {
  const { t } = useTranslation();
  const editor = useEditor();
  const boards = useBoardWorkspaceStore((state) => state.boards);
  const activeBoardId = useBoardWorkspaceStore((state) => state.activeBoardId);
  const actions = useBoardPageActions();
  function readBoardCounts(): Map<string, number> {
    return new Map(boards.map((board) => [
      board.id,
      [...editor.getPageShapeIds(board.id as TLPageId)]
        .map((shapeId) => editor.getShape(shapeId))
        .filter((shape) => shape?.type === 'task-card').length,
    ]));
  }

  const boardCounts = useValue('board task card counts', readBoardCounts, [editor, boards]);
  function boardCount(boardId: string): number {
    return boardCounts.get(boardId) ?? 0;
  }
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [actionBoardId, setActionBoardId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const active = boards.find((board) => board.id === activeBoardId) ?? boards[0];

  // Report open state so the sibling Agent panel can close itself.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);

  function handleDocumentPointerDown(event: PointerEvent): void {
    if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
  }

  function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    document.addEventListener('pointerdown', handleDocumentPointerDown);
    document.addEventListener('keydown', handleDocumentKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown);
      document.removeEventListener('keydown', handleDocumentKeyDown);
    };
  }, [open]);

  function closeAndReset(): void {
    setOpen(false);
    setRenamingId(null);
    setActionBoardId(null);
  }

  function toggleBoardMenu(): void {
    if (open) closeAndReset();
    else setOpen(true);
  }

  function selectBoard(boardId: string): void {
    actions.switchBoard(boardId);
    closeAndReset();
  }

  function toggleBoardActions(boardId: string): void {
    setActionBoardId((current) => current === boardId ? null : boardId);
  }

  function startRename(boardId: string): void {
    const board = boards.find((item) => item.id === boardId);
    if (!board) return;
    setRenamingId(boardId);
    setDraft(board.name);
    setActionBoardId(null);
  }

  function duplicateBoard(boardId: string): void {
    actions.duplicateBoard(boardId);
    closeAndReset();
  }

  function deleteBoard(boardId: string): void {
    const board = boards.find((item) => item.id === boardId);
    if (!board || !window.confirm(t('board.switcher.deleteConfirm', { name: board.name }))) return;
    actions.deleteBoard(boardId);
    closeAndReset();
  }

  function createBoard(): void {
    actions.createBoard();
    closeAndReset();
  }

  function handleRenameSubmit(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (renamingId) commitRename(renamingId);
  }

  function handleRenameKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    setRenamingId(null);
  }

  function commitRename(id: string): void {
    const ok = actions.renameBoard(id, draft);
    if (ok) {
      setRenamingId(null);
      setDraft('');
    }
  }

  if (!active) return null;

  return (
    <div
      ref={rootRef}
      className="relative flex items-stretch"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls="board-switcher-menu"
        title={t('board.switcher.open')}
        onClick={toggleBoardMenu}
        className={`flex max-w-[190px] items-center gap-1.5 px-2.5 text-xs transition-colors ${
          open ? 'bg-zinc-100 text-black' : 'text-zinc-200 hover:bg-zinc-800 hover:text-white'
        }`}
      >
        <span className="min-w-0 truncate">{active.name}</span>
        <span className={`shrink-0 text-[10px] tabular-nums ${open ? 'text-zinc-600' : 'text-zinc-500'}`}>
          {boardCount(active.id)}
        </span>
        <ChevronDown className={`h-3 w-3 shrink-0 transition-transform ${open ? 'rotate-180' : 'text-zinc-500'}`} />
      </button>

      {open ? (
        <div
          id="board-switcher-menu"
          role="menu"
          aria-label={t('board.switcher.title')}
          className="absolute left-0 top-[calc(100%+5px)] z-[160001] w-[min(280px,calc(100vw-24px))] border border-zinc-700 bg-zinc-950 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
            <span className="pixel-font text-[9px] text-zinc-100">{t('board.switcher.title')}</span>
            <span className="text-[10px] tabular-nums text-zinc-600">{boards.length}</span>
          </div>

          <div className="max-h-[min(360px,50vh)] overflow-y-auto py-1">
            {boards.map((board) => {
              const isActive = board.id === activeBoardId;
              const renaming = renamingId === board.id;
              return (
                <div key={board.id} className="group relative flex items-center gap-1 px-1">
                  {renaming ? (
                    <form
                      className="flex min-w-0 flex-1 items-center gap-1 py-1"
                      onSubmit={handleRenameSubmit}
                    >
                      <input
                        autoFocus
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={handleRenameKeyDown}
                        aria-label={t('board.switcher.rename')}
                        className="min-w-0 flex-1 border border-zinc-600 bg-black px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-400"
                      />
                      <button
                        type="submit"
                        title={t('board.switcher.save')}
                        aria-label={t('board.switcher.save')}
                        className="flex h-6 w-6 shrink-0 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        role="menuitem"
                        aria-current={isActive ? 'true' : undefined}
                          onClick={() => selectBoard(board.id)}
                        className={`flex h-8 min-w-0 flex-1 items-center gap-2 px-2 text-left text-xs ${
                          isActive ? 'bg-zinc-100 text-black' : 'text-zinc-200 hover:bg-zinc-900'
                        }`}
                      >
                        <Check className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'opacity-100' : 'opacity-0'}`} />
                        <span className="min-w-0 flex-1 truncate">{board.name}</span>
                        <span className={`shrink-0 text-[11px] tabular-nums ${isActive ? 'text-zinc-600' : 'text-zinc-500'}`}>
                          {boardCount(board.id)}
                        </span>
                      </button>
                      <button
                        type="button"
                        title={t('board.switcher.actions')}
                        aria-label={t('board.switcher.actions')}
                        aria-expanded={actionBoardId === board.id}
                        onClick={() => toggleBoardActions(board.id)}
                        className={`flex h-7 w-7 shrink-0 items-center justify-center opacity-0 group-hover:opacity-100 focus:opacity-100 ${actionBoardId === board.id ? 'opacity-100' : ''} ${isActive ? 'text-zinc-600 hover:bg-zinc-300 hover:text-black' : 'text-zinc-500 hover:bg-zinc-800 hover:text-white'}`}
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                      </button>
                      {actionBoardId === board.id ? (
                        <div className="absolute right-1 top-full z-10 mt-1 w-36 border border-zinc-700 bg-zinc-950 p-1 shadow-xl">
                          <button
                            type="button"
                            onClick={() => startRename(board.id)}
                            className="flex h-7 w-full items-center gap-2 px-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
                          >
                            <Pencil className="h-3 w-3" />
                            {t('board.switcher.rename')}
                          </button>
                          <button
                            type="button"
                            onClick={() => duplicateBoard(board.id)}
                            className="flex h-7 w-full items-center gap-2 px-2 text-left text-[11px] text-zinc-300 hover:bg-zinc-800 hover:text-white"
                          >
                            <Copy className="h-3 w-3" />
                            {t('board.switcher.duplicate')}
                          </button>
                          <button
                            type="button"
                            disabled={boards.length <= 1}
                            onClick={() => deleteBoard(board.id)}
                            className="flex h-7 w-full items-center gap-2 px-2 text-left text-[11px] text-red-300 hover:bg-zinc-800 disabled:pointer-events-none disabled:opacity-40"
                          >
                            <Trash2 className="h-3 w-3" />
                            {t('board.switcher.delete')}
                          </button>
                        </div>
                      ) : null}
                    </>
                  )}
                </div>
              );
            })}
          </div>

          <div className="border-t border-zinc-800 p-1">
            <button
              type="button"
              role="menuitem"
              disabled={boards.length >= BOARD_MAX_COUNT}
              onClick={createBoard}
              className="flex h-8 w-full items-center gap-2 px-2 text-left text-xs text-zinc-300 hover:bg-zinc-900 hover:text-white disabled:pointer-events-none disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              {t('board.switcher.create')}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
