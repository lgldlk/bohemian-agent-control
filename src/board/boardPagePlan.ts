import type { BoardRecord } from './boardWorkspaceModel';
import { sortBoards } from './boardWorkspaceModel';

export interface PageLike {
  id: string;
  name: string;
}

/** Page operations the bridge needs. Kept minimal so tests can drive a fake. */
export interface PageHost {
  getPages(): PageLike[];
  createPage(page: { id: string; name: string }): void;
  renamePage(id: string, name: string): void;
}

export interface PagePlan {
  create: Array<{ id: string; name: string }>;
  rename: Array<{ id: string; name: string }>;
}

/**
 * Applies the board shell to tldraw's page list.
 *
 * Returns exactly the work needed, so the caller can detect a no-op reconcile
 * and avoid re-entering the bridge on every store event.
 */
export function planPageChanges(boards: readonly BoardRecord[], pages: readonly PageLike[]): PagePlan {
  const ordered = sortBoards(boards);
  const pageIds = new Set(pages.map((page) => page.id));
  const create: PagePlan['create'] = [];
  const rename: PagePlan['rename'] = [];

  for (const board of ordered) {
    if (!pageIds.has(board.id)) create.push({ id: board.id, name: board.name });
  }
  for (const page of pages) {
    const board = ordered.find((item) => item.id === page.id);
    if (board && board.name !== page.name) rename.push({ id: page.id, name: board.name });
  }
  return { create, rename };
}

export function isPlanEmpty(plan: PagePlan): boolean {
  return plan.create.length === 0 && plan.rename.length === 0;
}

/** Applies a plan to a page host. Idempotent: an empty plan does nothing. */
export function applyPagePlan(host: PageHost, plan: PagePlan): void {
  for (const page of plan.create) host.createPage(page);
  for (const page of plan.rename) host.renamePage(page.id, page.name);
}
