import { describe, expect, it } from 'vitest';
import { applyPagePlan, isPlanEmpty, planPageChanges, type PageLike } from './boardPagePlan';
import type { BoardRecord } from './boardWorkspaceModel';

const page = (id: string, name: string): PageLike => ({ id, name });

function board(id: string, name: string, order: number): BoardRecord {
  return { id, name, order, createdAt: 0 };
}

describe('planPageChanges', () => {
  it('creates a page for a board that has none', () => {
    const plan = planPageChanges([board('page:a', '主画板', 0)], []);
    expect(plan.create).toEqual([{ id: 'page:a', name: '主画板' }]);
    expect(plan.rename).toEqual([]);
  });

  it('plans nothing when every page already matches', () => {
    const plan = planPageChanges(
      [board('page:a', '主画板', 0), board('page:b', '项目 A', 1)],
      [page('page:a', '主画板'), page('page:b', '项目 A')],
    );
    expect(isPlanEmpty(plan)).toBe(true);
  });

  it('renames a page whose board name changed', () => {
    const plan = planPageChanges([board('page:a', '新名字', 0)], [page('page:a', '旧名字')]);
    expect(plan.rename).toEqual([{ id: 'page:a', name: '新名字' }]);
    expect(plan.create).toEqual([]);
  });

  it('ignores a page that has no board record', () => {
    const plan = planPageChanges([board('page:a', '主画板', 0)], [
      page('page:a', '主画板'),
      page('page:orphan', '无主页面'),
    ]);
    expect(isPlanEmpty(plan)).toBe(true);
  });

  it('creates in board display order, not array order', () => {
    const plan = planPageChanges(
      [board('page:b', '第二个', 1), board('page:a', '第一个', 0)],
      [],
    );
    expect(plan.create.map((p) => p.id)).toEqual(['page:a', 'page:b']);
  });

  it('is stable across repeated planning with no change', () => {
    const store = { pages: [] as PageLike[] };
    const boards = [board('page:a', '主画板', 0)];
    applyPagePlan({
      getPages: () => store.pages,
      createPage: (p) => store.pages.push(p),
      renamePage: (id, name) => {
        store.pages = store.pages.map((item) => (item.id === id ? { ...item, name } : item));
      },
    }, planPageChanges(boards, store.pages));

    const second = planPageChanges(boards, store.pages);
    expect(isPlanEmpty(second)).toBe(true);
  });
});

describe('applyPagePlan', () => {
  it('does nothing for an empty plan', () => {
    const calls: string[] = [];
    applyPagePlan({
      getPages: () => [],
      createPage: (p) => calls.push(`create:${p.id}`),
      renamePage: (id) => calls.push(`rename:${id}`),
    }, { create: [], rename: [] });
    expect(calls).toEqual([]);
  });

  it('creates then renames in one pass', () => {
    const store = { pages: [page('page:a', '旧名字'), page('page:b', '暂存')] as PageLike[] };
    applyPagePlan({
      getPages: () => store.pages,
      createPage: (p) => store.pages.push(p),
      renamePage: (id, name) => {
        store.pages = store.pages.map((item) => (item.id === id ? { ...item, name } : item));
      },
    }, planPageChanges(
      [board('page:a', '项目 A', 0), board('page:b', '项目 B', 1), board('page:c', '项目 C', 2)],
      store.pages,
    ));

    expect(store.pages.map((p) => `${p.id}=${p.name}`)).toEqual([
      'page:a=项目 A',
      'page:b=项目 B',
      'page:c=项目 C',
    ]);
  });
});
