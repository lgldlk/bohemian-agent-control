import { useCallback, useState } from 'react';

export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;

function clampZoom(z: number): number {
  if (!Number.isFinite(z)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));
}

/** 世界坐标 → 屏幕坐标 */
export const toScreen = (
  wx: number,
  wy: number,
  vp: Viewport,
): { x: number; y: number } => ({ x: wx * vp.zoom + vp.x, y: wy * vp.zoom + vp.y });

/** 屏幕坐标 → 世界坐标 */
export const toWorld = (
  sx: number,
  sy: number,
  vp: Viewport,
): { x: number; y: number } => ({ x: (sx - vp.x) / vp.zoom, y: (sy - vp.y) / vp.zoom });

export function useBoardViewport(): {
  vp: Viewport;
  setVp: (v: Viewport) => void;
  zoomAt: (sx: number, sy: number, next: number) => void;
} {
  const [vp, setVpState] = useState<Viewport>({ x: 0, y: 0, zoom: 1 });

  const setVp = useCallback((v: Viewport) => {
    setVpState({ x: v.x, y: v.y, zoom: clampZoom(v.zoom) });
  }, []);

  const zoomAt = useCallback((sx: number, sy: number, next: number) => {
    setVpState((prev) => {
      const zoom = clampZoom(next);
      const world = toWorld(sx, sy, prev);
      return { x: sx - world.x * zoom, y: sy - world.y * zoom, zoom };
    });
  }, []);

  return { vp, setVp, zoomAt };
}
