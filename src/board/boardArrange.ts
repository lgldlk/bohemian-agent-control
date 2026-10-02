import { BOARD_PLACE_GAP } from './boardPlacement';
import {
  FRAME_DEFAULT_H,
  FRAME_DEFAULT_W,
  FRAME_HEADING_SCREEN_HEIGHT,
  FRAME_PAD,
  FRAME_TITLE,
} from './groupFrame';

/** 列与列、行与行、组与组之间的间距。与画板落位相同。 */
export const ARRANGE_GAP = BOARD_PLACE_GAP;

export interface ArrangeNode {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrangeCluster {
  folder: string;
  /** codex、pi、claude-code。空的排在已知分类后面。 */
  agentKind?: string;
  card: ArrangeNode;
  terminals: ArrangeNode[];
  /** 终端尚未创建时预留的尺寸，避免后续终端覆盖下一行。 */
  reservedTerminal?: { w: number; h: number };
}

export interface ArrangePlacement {
  id: string;
  x: number;
  y: number;
}

export interface ClusterLayout {
  placements: ArrangePlacement[];
  width: number;
  height: number;
}

export interface ArrangeGroupInput {
  id: string;
  x: number;
  y: number;
  clusters: ArrangeCluster[];
}

export interface ArrangeFramePlacement {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArrangeShapePlacement extends ArrangePlacement {
  /** null 表示放在页面上，不进组。 */
  parentId: string | null;
}

export interface ArrangeBoardPlan {
  frames: ArrangeFramePlacement[];
  shapes: ArrangeShapePlacement[];
}

export const AGENT_ROW_KINDS = ['codex', 'pi', 'claude-code'] as const;
export const DEFAULT_AGENTS_PER_ROW = 3;

export function compareReadingOrder(a: { x: number; y: number }, b: { x: number; y: number }): number {
  if (a.y !== b.y) return a.y - b.y;
  return a.x - b.x;
}

export function agentRowKind(kind: string | undefined): string {
  const value = (kind ?? '').trim().toLowerCase();
  if (value === 'claude' || value === 'claude-code') return 'claude-code';
  if (value === 'codex' || value === 'pi') return value;
  return value;
}

function chunk<T>(items: T[], size: number): T[][] {
  const width = Math.max(1, Math.floor(size));
  const rows: T[][] = [];
  for (let index = 0; index < items.length; index += width) rows.push(items.slice(index, index + width));
  return rows;
}

function rowsOf(clusters: ArrangeCluster[], perRow: number): ArrangeCluster[][] {
  const sorted = [...clusters].sort((a, b) => compareReadingOrder(a.card, b.card) || a.card.id.localeCompare(b.card.id));
  const byKind = new Map<string, Map<string, ArrangeCluster[]>>();
  const extraKinds: string[] = [];
  for (const cluster of sorted) {
    const kind = agentRowKind(cluster.agentKind);
    let folders = byKind.get(kind);
    if (!folders) {
      folders = new Map();
      byKind.set(kind, folders);
      if (kind !== '' && !AGENT_ROW_KINDS.includes(kind as (typeof AGENT_ROW_KINDS)[number])) extraKinds.push(kind);
    }
    const list = folders.get(cluster.folder);
    if (list) list.push(cluster);
    else folders.set(cluster.folder, [cluster]);
  }

  const kindOrder = [
    ...AGENT_ROW_KINDS.filter((kind) => byKind.has(kind)),
    ...extraKinds,
    ...(byKind.has('') ? [''] : []),
  ];
  const rows: ArrangeCluster[][] = [];
  for (const kind of kindOrder) {
    const folders = byKind.get(kind)!;
    const folderOrder = [...folders.keys()];
    const known = folderOrder.filter((folder) => folder !== '');
    const unknown = folderOrder.filter((folder) => folder === '');
    for (const folder of [...known, ...unknown]) {
      rows.push(...chunk(folders.get(folder)!, perRow));
    }
  }
  return rows;
}

/**
 * 同一个文件夹、同一种 Agent 排在一起。满 perRow 个就换行。
 * 分类顺序是 Codex、Pi、Claude Code。任务卡在终端上面，整列水平居中。
 */
export function layoutFolderRows(
  clusters: ArrangeCluster[],
  originX: number,
  originY: number,
  gap = ARRANGE_GAP,
  perRow = DEFAULT_AGENTS_PER_ROW,
): ClusterLayout {
  const placements: ArrangePlacement[] = [];
  if (clusters.length === 0) return { placements, width: 0, height: 0 };

  let y = originY;
  let maxRight = originX;
  const rows = rowsOf(clusters, perRow);
  rows.forEach((row, rowIndex) => {
    let x = originX;
    let rowHeight = 0;
    for (const cluster of row) {
      const terminals = [...cluster.terminals].sort((a, b) => compareReadingOrder(a, b) || a.id.localeCompare(b.id));
      const reservedTerminal = terminals.length === 0 ? cluster.reservedTerminal : undefined;
      const columnWidth = Math.max(
        cluster.card.w,
        reservedTerminal?.w ?? 0,
        ...terminals.map((terminal) => terminal.w),
      );
      placements.push({
        id: cluster.card.id,
        x: x + (columnWidth - cluster.card.w) / 2,
        y,
      });
      let bottom = y + cluster.card.h;
      if (terminals.length > 0 || reservedTerminal) bottom += gap;
      for (let index = 0; index < terminals.length; index += 1) {
        const terminal = terminals[index];
        placements.push({
          id: terminal.id,
          x: x + (columnWidth - terminal.w) / 2,
          y: bottom,
        });
        bottom += terminal.h;
        if (index < terminals.length - 1) bottom += gap;
      }
      if (reservedTerminal) bottom += reservedTerminal.h;
      rowHeight = Math.max(rowHeight, bottom - y);
      x += columnWidth + gap;
    }
    maxRight = Math.max(maxRight, x - gap);
    y += rowHeight;
    if (rowIndex < rows.length - 1) y += gap;
  });

  return {
    placements,
    width: maxRight - originX,
    height: y - originY,
  };
}

/** 组内整理：组的页面位置不动，只重排内部并收回组框。 */
export function arrangeInsideFrame(
  clusters: ArrangeCluster[],
  perRow = DEFAULT_AGENTS_PER_ROW,
): { w: number; h: number; placements: ArrangePlacement[] } | null {
  if (clusters.length === 0) return null;
  const layout = layoutFolderRows(clusters, FRAME_PAD, FRAME_TITLE + FRAME_PAD, ARRANGE_GAP, perRow);
  return {
    w: FRAME_PAD + layout.width + FRAME_PAD,
    h: FRAME_TITLE + FRAME_PAD + layout.height + FRAME_PAD,
    placements: layout.placements,
  };
}

/** 整板整理：组按阅读顺序上下叠放，未分组的文件夹行排在所有组下面。 */
export function arrangeBoard(input: {
  groups: ArrangeGroupInput[];
  ungrouped: ArrangeCluster[];
  perRow?: number;
  /** frame 外部标题在页面坐标中的高度。默认按 100% 缩放计算。 */
  titleClearance?: number;
}): ArrangeBoardPlan {
  const perRow = input.perRow ?? DEFAULT_AGENTS_PER_ROW;
  const titleClearance = input.titleClearance ?? FRAME_HEADING_SCREEN_HEIGHT;
  const points = [
    ...input.groups.map((group) => ({ x: group.x, y: group.y })),
    ...input.ungrouped.map((cluster) => ({ x: cluster.card.x, y: cluster.card.y })),
  ];
  if (points.length === 0) return { frames: [], shapes: [] };

  const originX = Math.min(...points.map((point) => point.x));
  const originY = Math.min(...points.map((point) => point.y));
  const groups = [...input.groups].sort((a, b) => compareReadingOrder(a, b) || a.id.localeCompare(b.id));

  const frames: ArrangeFramePlacement[] = [];
  const shapes: ArrangeShapePlacement[] = [];
  let cursorY = originY;
  for (let groupIndex = 0; groupIndex < groups.length; groupIndex += 1) {
    const group = groups[groupIndex];
    const hasNextGroup = groupIndex < groups.length - 1;
    if (group.clusters.length === 0) {
      frames.push({ id: group.id, x: originX, y: cursorY, w: FRAME_DEFAULT_W, h: FRAME_DEFAULT_H });
      cursorY += FRAME_DEFAULT_H + ARRANGE_GAP + (hasNextGroup ? titleClearance : 0);
      continue;
    }
    const inside = arrangeInsideFrame(group.clusters, perRow);
    if (!inside) continue;
    frames.push({ id: group.id, x: originX, y: cursorY, w: inside.w, h: inside.h });
    for (const placement of inside.placements) {
      shapes.push({ ...placement, parentId: group.id });
    }
    cursorY += inside.h + ARRANGE_GAP + (hasNextGroup ? titleClearance : 0);
  }

  if (input.ungrouped.length > 0) {
    const loose = layoutFolderRows(input.ungrouped, originX, cursorY, ARRANGE_GAP, perRow);
    for (const placement of loose.placements) {
      shapes.push({ ...placement, parentId: null });
    }
  }

  return { frames, shapes };
}
