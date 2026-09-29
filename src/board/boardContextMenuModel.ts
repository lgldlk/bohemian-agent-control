export type BoardContextKind =
  | 'canvas'
  | 'tasks'
  | 'terminal'
  | 'group'
  | 'system-link'
  | 'free-shapes'
  | 'mixed';

export interface ContextShapeLike {
  type: string;
  meta?: Record<string, unknown> | null;
}

export function classifyBoardContext(shapes: ContextShapeLike[]): BoardContextKind {
  if (shapes.length === 0) return 'canvas';
  if (shapes.every((shape) => shape.type === 'task-card')) return 'tasks';
  if (shapes.length === 1 && shapes[0].type === 'terminal') return 'terminal';
  if (
    shapes.length === 1
    && shapes[0].type === 'frame'
    && typeof shapes[0].meta?.groupId === 'string'
  ) return 'group';
  if (
    shapes.length === 1
    && shapes[0].type === 'arrow'
    && shapes[0].meta?.role === 'node-link'
  ) return 'system-link';

  const containsBusinessShape = shapes.some((shape) =>
    shape.type === 'task-card'
    || shape.type === 'terminal'
    || (shape.type === 'frame' && typeof shape.meta?.groupId === 'string')
    || (shape.type === 'arrow' && shape.meta?.role === 'node-link'));
  return containsBusinessShape ? 'mixed' : 'free-shapes';
}
