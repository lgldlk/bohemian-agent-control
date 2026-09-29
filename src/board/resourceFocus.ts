import type { TLShapeId } from 'tldraw';

const pendingResourceFocus = new Set<TLShapeId>();

export function requestResourceFocus(shapeId: TLShapeId): void {
  pendingResourceFocus.add(shapeId);
}

export function consumePendingResourceFocus(shapeId: TLShapeId): boolean {
  if (!pendingResourceFocus.has(shapeId)) return false;
  pendingResourceFocus.delete(shapeId);
  return true;
}
