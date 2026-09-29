import { describe, expect, it } from 'vitest';
import { folderKeyOf } from '@/domain/folderKey';
import { FRAME_DEFAULT_H, FRAME_DEFAULT_W, FRAME_PAD, FRAME_TITLE } from './groupFrame';
import {
  ARRANGE_GAP,
  arrangeBoard,
  arrangeInsideFrame,
  layoutFolderRows,
  type ArrangeCluster,
} from './boardArrange';

const card = (id: string, x: number, y: number) => ({ id, x, y, w: 320, h: 112 });
const terminal = (id: string, x: number, y: number) => ({ id, x, y, w: 720, h: 440 });

describe('folderKeyOf', () => {
  it('uses the working directory and drops a trailing slash', () => {
    expect(folderKeyOf({ workingDir: '/repo/app/', project: 'app' })).toBe('/repo/app');
  });

  it('falls back to the project name, then an empty key', () => {
    expect(folderKeyOf({ project: 'app' })).toBe('project:app');
    expect(folderKeyOf({})).toBe('');
  });
});

describe('layoutFolderRows', () => {
  const clusters: ArrangeCluster[] = [
    { folder: '/a', card: card('c1', 10, 40), terminals: [terminal('t1', 0, 200)] },
    { folder: '/a', card: card('c2', 400, 10), terminals: [] },
    { folder: '/b', card: card('c3', 0, 0), terminals: [] },
    { folder: '', card: card('c4', -20, -20), terminals: [] },
  ];

  it('keeps one folder on a single row and centers the card over its terminal', () => {
    const layout = layoutFolderRows(clusters, 0, 0);
    const byId = Object.fromEntries(layout.placements.map((item) => [item.id, item]));
    expect(byId.c3).toEqual({ id: 'c3', x: 0, y: 0 });
    expect(byId.c2).toEqual({ id: 'c2', x: 0, y: 112 + ARRANGE_GAP });
    expect(byId.c1).toEqual({
      id: 'c1',
      x: 320 + ARRANGE_GAP + (720 - 320) / 2,
      y: 112 + ARRANGE_GAP,
    });
    expect(byId.t1).toEqual({
      id: 't1',
      x: 320 + ARRANGE_GAP,
      y: 112 + ARRANGE_GAP + 112 + ARRANGE_GAP,
    });
    expect(byId.c4.y).toBeGreaterThan(byId.t1.y);
    expect(layout.width).toBe(320 + ARRANGE_GAP + 720);
  });

  it('stacks two terminals under the card, each centered on the column', () => {
    const layout = layoutFolderRows([{
      folder: '/a',
      card: card('c', 5, 5),
      terminals: [terminal('t-low', 0, 80), { id: 't-high', x: 0, y: 10, w: 100, h: 40 }],
    }], 0, 0);
    const byId = Object.fromEntries(layout.placements.map((item) => [item.id, item]));
    expect(byId['t-high']).toMatchObject({ x: (720 - 100) / 2, y: 112 + ARRANGE_GAP });
    expect(byId['t-low'].y).toBe(112 + ARRANGE_GAP + 40 + ARRANGE_GAP);
    expect(byId.c.x).toBe((720 - 320) / 2);
  });

  it('wraps a folder after the configured number of agents', () => {
    const many: ArrangeCluster[] = [0, 1, 2, 3].map((index) => ({
      folder: '/a',
      agentKind: 'codex',
      card: card(`c${index}`, index, 0),
      terminals: [],
    }));
    const layout = layoutFolderRows(many, 0, 0, ARRANGE_GAP, 3);
    const byId = Object.fromEntries(layout.placements.map((item) => [item.id, item]));
    expect(byId.c0.y).toBe(byId.c1.y);
    expect(byId.c2.y).toBe(byId.c0.y);
    expect(byId.c3.y).toBeGreaterThan(byId.c0.y);
    expect(byId.c3.x).toBe(0);
  });

  it('starts a new row for each agent kind, in Codex, Pi, Claude Code order', () => {
    const mixed: ArrangeCluster[] = [
      { folder: '/repo', agentKind: 'claude-code', card: card('claude', 0, 0), terminals: [] },
      { folder: '/repo', agentKind: 'pi', card: card('pi', 10, 0), terminals: [] },
      { folder: '/repo', agentKind: 'codex', card: card('codex', 20, 0), terminals: [] },
    ];
    const layout = layoutFolderRows(mixed, 0, 0, ARRANGE_GAP, 3);
    const byId = Object.fromEntries(layout.placements.map((item) => [item.id, item]));
    expect(byId.codex.y).toBeLessThan(byId.pi.y);
    expect(byId.pi.y).toBeLessThan(byId.claude.y);
    expect(byId.codex.x).toBe(0);
    expect(byId.pi.x).toBe(0);
    expect(byId.claude.x).toBe(0);
  });

  it('reserves terminal height before the terminal shape exists', () => {
    const mixed: ArrangeCluster[] = [
      {
        folder: '/repo',
        agentKind: 'codex',
        card: card('codex', 0, 0),
        terminals: [],
        reservedTerminal: { w: 720, h: 440 },
      },
      { folder: '/repo', agentKind: 'pi', card: card('pi', 0, 0), terminals: [] },
    ];
    const layout = layoutFolderRows(mixed, 0, 0, ARRANGE_GAP, 3);
    const byId = Object.fromEntries(layout.placements.map((item) => [item.id, item]));
    expect(byId.pi.y).toBe(112 + ARRANGE_GAP + 440 + ARRANGE_GAP);
  });

  it('fills the remaining slot in an agent row even when the new card started far away', () => {
    const sameKind: ArrangeCluster[] = [
      { folder: '/repo', agentKind: 'pi', card: card('first', 0, 0), terminals: [] },
      { folder: '/repo', agentKind: 'pi', card: card('second', 400, 0), terminals: [] },
      { folder: '/repo', agentKind: 'pi', card: card('new', 9000, 9000), terminals: [] },
    ];
    const layout = layoutFolderRows(sameKind, 0, 0, ARRANGE_GAP, 3);
    const byId = Object.fromEntries(layout.placements.map((item) => [item.id, item]));
    expect(byId.new.y).toBe(byId.first.y);
    expect(byId.new.x).toBeGreaterThan(byId.second.x);
  });

  it('is unchanged when run again on its own result', () => {
    const first = layoutFolderRows(clusters, FRAME_PAD, FRAME_TITLE + FRAME_PAD);
    const placed = new Map(first.placements.map((item) => [item.id, item]));
    const again = clusters.map((cluster) => ({
      ...cluster,
      card: { ...cluster.card, ...placed.get(cluster.card.id) },
      terminals: cluster.terminals.map((item) => ({ ...item, ...placed.get(item.id) })),
    }));
    expect(layoutFolderRows(again, FRAME_PAD, FRAME_TITLE + FRAME_PAD)).toEqual(first);
  });
});

describe('arrangeBoard', () => {
  it('stacks groups from the current top-left and puts loose folder rows below them', () => {
    const grouped: ArrangeCluster = { folder: '/a', card: card('in', 20, 20), terminals: [] };
    const loose: ArrangeCluster = { folder: '/b', card: card('out', 50, 300), terminals: [] };
    const plan = arrangeBoard({
      groups: [
        { id: 'g1', x: 100, y: 200, clusters: [grouped] },
        { id: 'g-empty', x: 0, y: 0, clusters: [] },
      ],
      ungrouped: [loose],
    });
    const inside = arrangeInsideFrame([grouped])!;
    expect(plan.frames.map((frame) => frame.id)).toEqual(['g-empty', 'g1']);
    expect(plan.frames[0]).toMatchObject({ x: 0, y: 0, w: FRAME_DEFAULT_W, h: FRAME_DEFAULT_H });
    expect(plan.frames[1]).toMatchObject({
      x: 0,
      y: FRAME_DEFAULT_H + ARRANGE_GAP,
      w: inside.w,
      h: inside.h,
    });
    expect(plan.shapes.find((shape) => shape.id === 'in')).toMatchObject({
      parentId: 'g1',
      x: FRAME_PAD,
      y: FRAME_TITLE + FRAME_PAD,
    });
    expect(plan.shapes.find((shape) => shape.id === 'out')).toMatchObject({
      parentId: null,
      x: 0,
      y: FRAME_DEFAULT_H + ARRANGE_GAP + inside.h + ARRANGE_GAP,
    });
  });
});
