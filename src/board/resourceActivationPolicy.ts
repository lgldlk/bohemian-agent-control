import type { Editor, TLShapeId } from 'tldraw';
import type { ResourcePerformanceSettings } from '@/plugin-system';

export interface ResourceActivationPolicy {
  initialized: boolean;
  smartEnabled: boolean;
  resourceCount: number;
  readableIds: ReadonlySet<TLShapeId>;
  deferredIds: ReadonlySet<TLShapeId>;
}

const MIN_READABLE_WIDTH_PX = 180;
const MIN_READABLE_HEIGHT_PX = 100;

function intersects(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function distanceToViewportCenter(
  bounds: { x: number; y: number; w: number; h: number },
  viewport: { x: number; y: number; w: number; h: number },
): number {
  const shapeX = bounds.x + bounds.w / 2;
  const shapeY = bounds.y + bounds.h / 2;
  const viewportX = viewport.x + viewport.w / 2;
  const viewportY = viewport.y + viewport.h / 2;
  return Math.hypot(shapeX - viewportX, shapeY - viewportY);
}

export function getResourceActivationPolicy(
  editor: Editor,
  settings: ResourcePerformanceSettings,
): ResourceActivationPolicy {
  const resources = editor.getCurrentPageShapes().filter((shape) => shape.type === 'resource');
  const resourceCount = resources.length;
  if (!settings.enabled || resourceCount < settings.resourceThreshold) {
    return {
      initialized: true,
      smartEnabled: settings.enabled,
      resourceCount,
      readableIds: new Set(resources.map((shape) => shape.id)),
      deferredIds: new Set(),
    };
  }

  const viewport = editor.getViewportPageBounds();
  const zoom = Math.max(0.01, editor.getZoomLevel());
  const ranked = resources.map((shape) => {
    const bounds = editor.getShapePageBounds(shape) ?? {
      x: shape.x,
      y: shape.y,
      w: Number((shape.props as { w?: number }).w ?? 0),
      h: Number((shape.props as { h?: number }).h ?? 0),
    };
    const readable = intersects(bounds, viewport)
      && bounds.w * zoom >= MIN_READABLE_WIDTH_PX
      && bounds.h * zoom >= MIN_READABLE_HEIGHT_PX;
    return {
      id: shape.id,
      readable,
      distance: distanceToViewportCenter(bounds, viewport),
    };
  });

  const readableIds = new Set(ranked.filter((item) => item.readable).map((item) => item.id));
  const remainingSlots = Math.max(0, settings.resourceThreshold - readableIds.size);
  const deferredIds = new Set(
    ranked
      .filter((item) => !item.readable)
      .sort((a, b) => a.distance - b.distance)
      .slice(remainingSlots)
      .map((item) => item.id),
  );
  return { initialized: true, smartEnabled: settings.enabled, resourceCount, readableIds, deferredIds };
}
