export interface BoardPin {
  id: string;
  taskId: string;
  /** 世界坐标 X(px,白板坐标系) */
  x: number;
  /** 世界坐标 Y(px,白板坐标系) */
  y: number;
  /** 卡片宽度(px) */
  w: number;
  /** 卡片高度(px) */
  h: number;
}

export interface BoardWire {
  id: string;
  from: string;
  to: string;
  color: string;
  label: string;
}

export interface BoardDoc {
  groups: { id: string; name: string }[];
  pins: BoardPin[];
  wires: BoardWire[];
}

/** 卡片默认宽度 */
export const DEFAULT_PIN_W = 300;
/** 卡片默认高度 */
export const DEFAULT_PIN_H = 118;
/** 卡片最小宽度 */
export const PIN_MIN_W = 200;
/** 卡片最小高度 */
export const PIN_MIN_H = 84;
