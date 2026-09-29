/** 画板上新形状的页面落位。分组框不改变这套算法。 */

export const BOARD_PLACE_GAP = 48;
export const TERMINAL_DEFAULT_W = 720;
export const TERMINAL_DEFAULT_H = 440;

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function placeLikeBoard(input: {
  anchor: Bounds;
  width: number;
  height: number;
  beside: boolean;
  direction: 'horizontal' | 'vertical';
  gap?: number;
}): { x: number; y: number } {
  const gap = input.gap ?? BOARD_PLACE_GAP;
  const { anchor, width, height, beside, direction } = input;
  if (beside && direction === 'horizontal') {
    return { x: anchor.x + anchor.w + gap, y: anchor.y };
  }
  if (beside) {
    return { x: anchor.x + (anchor.w - width) / 2, y: anchor.y + anchor.h + gap };
  }
  return {
    x: anchor.x + (anchor.w - width) / 2,
    y: anchor.y + (anchor.h - height) / 2,
  };
}
