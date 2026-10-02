/**
 * 分组框怎么包住内容。
 * 不决定画板上的落点，也不直接改 tldraw。
 */

import { BOARD_PLACE_GAP } from './boardPlacement';

export const FRAME_PAD = 36;
/** 组内内容顶部保留量。标题实际绘制在 frame 外部上方。 */
export const FRAME_TITLE = 32;
/** 业务分组标题的屏幕占位：36px 标题高度 + 4px 底部留白。 */
export const FRAME_HEADING_SCREEN_HEIGHT = 40;

/** 固定屏幕尺寸的标题换算为当前画布页面坐标高度。 */
export function frameHeadingPageHeight(zoom: number): number {
  return FRAME_HEADING_SCREEN_HEIGHT / Math.max(zoom, 0.01);
}
/** 可选的单边上限。默认不封顶，组会长到刚好包住新内容。 */
export const FRAME_GROW_STEP = 360;
/** 空组：两张卡并排（36+336+320+36）后再留一列空隙。 */
export const FRAME_DEFAULT_W = 880;
/** 空组：标题内边距加两行卡片（32+36+112+132+36）后再留出可继续放置的空间。 */
export const FRAME_DEFAULT_H = 520;

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 相对组左上角的内容盒。 */
export interface LocalChild {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayoutOptions {
  pad?: number;
  title?: number;
  maxStep?: number;
}

export interface FrameExpansion {
  frame: FrameBox;
  /** 组外框左移或上移时，加回子节点本地坐标，页面位置才不变。 */
  childDx: number;
  childDy: number;
  /** 这一步之后，内容是否已经落在内边距里。 */
  contained: boolean;
}

function contentEdges(children: LocalChild[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const child of children) {
    minX = Math.min(minX, child.x);
    minY = Math.min(minY, child.y);
    maxX = Math.max(maxX, child.x + child.w);
    maxY = Math.max(maxY, child.y + child.h);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * 计算组要长多少才能包住内容。不移动内容的页面坐标。
 * 没有溢出时返回 null。传入 maxStep 时，超出的部分这一步不包住。
 */
export function planFrameExpansion(
  frame: FrameBox,
  children: LocalChild[],
  options: FrameLayoutOptions = {},
): FrameExpansion | null {
  if (children.length === 0) return null;
  const pad = options.pad ?? FRAME_PAD;
  const title = options.title ?? FRAME_TITLE;
  const maxStep = options.maxStep ?? Number.POSITIVE_INFINITY;
  const { minX, minY, maxX, maxY } = contentEdges(children);

  const left = Math.max(0, pad - minX);
  const top = Math.max(0, title + pad - minY);
  const right = Math.max(0, maxX + pad - frame.w);
  const bottom = Math.max(0, maxY + pad - frame.h);
  const growLeft = Math.min(left, maxStep);
  const growTop = Math.min(top, maxStep);
  const growRight = Math.min(right, maxStep);
  const growBottom = Math.min(bottom, maxStep);
  if (growLeft === 0 && growTop === 0 && growRight === 0 && growBottom === 0) return null;

  return {
    frame: {
      x: frame.x - growLeft,
      y: frame.y - growTop,
      w: frame.w + growLeft + growRight,
      h: frame.h + growTop + growBottom,
    },
    childDx: growLeft,
    childDy: growTop,
    contained: growLeft === left && growTop === top && growRight === right && growBottom === bottom,
  };
}

/** 现有内容加上新内容后，组能不能长到完全包住。 */
export function frameCanAbsorb(
  frame: FrameBox,
  children: LocalChild[],
  options?: FrameLayoutOptions,
): boolean {
  const plan = planFrameExpansion(frame, children, options);
  return plan === null || plan.contained;
}

/** 终端在任务卡正下方，并相对这一列居中。坐标与卡片同一父级。 */
export function terminalBesideCard(
  card: LocalChild,
  terminal: { w: number; h: number },
  gap = BOARD_PLACE_GAP,
): LocalChild {
  return {
    x: card.x + (card.w - terminal.w) / 2,
    y: card.y + card.h + gap,
    w: terminal.w,
    h: terminal.h,
  };
}

function shiftBox(box: LocalChild, dx: number, dy: number): LocalChild {
  return { ...box, x: box.x + dx, y: box.y + dy };
}

function gapSeparated(a: LocalChild, b: LocalChild, gap: number): boolean {
  return a.x + a.w + gap <= b.x
    || b.x + b.w + gap <= a.x
    || a.y + a.h + gap <= b.y
    || b.y + b.h + gap <= a.y;
}

/**
 * 新 Agent 优先靠近点击处。那里会压住已有卡片或终端时，改放到最近的空位。
 * 空位按整列计算：卡片在上，终端在下。
 */
export function placeAddedAgent(input: {
  existing: LocalChild[];
  click: { x: number; y: number };
  card: { w: number; h: number };
  terminal: { w: number; h: number };
  gap?: number;
}): { card: LocalChild; terminal: LocalChild } {
  const gap = input.gap ?? BOARD_PLACE_GAP;
  const columnWidth = Math.max(input.card.w, input.terminal.w);
  const columnHeight = input.card.h + gap + input.terminal.h;
  const clickOrigin = {
    x: input.click.x - (columnWidth - input.card.w) / 2,
    y: input.click.y,
  };
  const candidates = [clickOrigin];
  for (const box of input.existing) {
    candidates.push({ x: box.x + box.w + gap, y: box.y });
    candidates.push({ x: box.x, y: box.y + box.h + gap });
  }
  if (input.existing.length > 0) {
    const minX = Math.min(...input.existing.map((box) => box.x));
    const minY = Math.min(...input.existing.map((box) => box.y));
    const maxX = Math.max(...input.existing.map((box) => box.x + box.w));
    const maxY = Math.max(...input.existing.map((box) => box.y + box.h));
    candidates.push({ x: maxX + gap, y: minY }, { x: minX, y: maxY + gap });
  }

  const fits = (origin: { x: number; y: number }) => {
    const column = { x: origin.x, y: origin.y, w: columnWidth, h: columnHeight };
    return input.existing.every((box) => gapSeparated(column, box, gap));
  };

  let best = clickOrigin;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const origin of candidates) {
    if (!fits(origin)) continue;
    const dx = origin.x - clickOrigin.x;
    const dy = origin.y - clickOrigin.y;
    const distance = dx * dx + dy * dy;
    if (distance < bestDistance) {
      best = origin;
      bestDistance = distance;
    }
  }

  const card: LocalChild = {
    x: best.x + (columnWidth - input.card.w) / 2,
    y: best.y,
    w: input.card.w,
    h: input.card.h,
  };
  return { card, terminal: terminalBesideCard(card, input.terminal, gap) };
}

/**
 * 组内添加 Agent。避开已有内容，组扩到刚好包住新的一列。
 * 已有内容的页面位置不变。
 */
export function fitGroupToAddedAgent(input: {
  frame: FrameBox;
  existing: LocalChild[];
  click: { x: number; y: number };
  card: { w: number; h: number };
  terminal: { w: number; h: number };
}): {
  frame: FrameBox;
  existing: LocalChild[];
  card: LocalChild;
  terminal: LocalChild;
} {
  const placed = placeAddedAgent(input);
  const plan = planFrameExpansion(input.frame, [...input.existing, placed.card, placed.terminal]);
  if (!plan) return { frame: input.frame, existing: input.existing, card: placed.card, terminal: placed.terminal };
  return {
    frame: plan.frame,
    existing: input.existing.map((box) => shiftBox(box, plan.childDx, plan.childDy)),
    card: shiftBox(placed.card, plan.childDx, plan.childDy),
    terminal: shiftBox(placed.terminal, plan.childDx, plan.childDy),
  };
}

export function boxInsideFrame(frame: FrameBox, box: LocalChild, pad = FRAME_PAD, title = FRAME_TITLE): boolean {
  return box.x >= pad
    && box.y >= title + pad
    && box.x + box.w <= frame.w - pad
    && box.y + box.h <= frame.h - pad;
}
