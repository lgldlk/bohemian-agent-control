import type { Editor, TLShapeId } from 'tldraw';

function taskIdOf(shape: { type: string; props: Record<string, unknown> }): string | null {
  if (shape.type !== 'task-card') return null;
  const value = shape.props.taskId;
  return typeof value === 'string' ? value : null;
}

export function findTaskShape(editor: Editor, taskId: string): TLShapeId | null {
  for (const shape of editor.getCurrentPageShapes()) {
    if (taskIdOf(shape as { type: string; props: Record<string, unknown> }) === taskId) return shape.id;
  }
  return null;
}

export function findFrameByGroupId(editor: Editor, groupId: string) {
  return editor.getCurrentPageShapes().find(
    (shape) => shape.type === 'frame' && (shape.meta as { groupId?: string } | null)?.groupId === groupId,
  );
}

export function groupIdOfFrame(shape: { type: string; meta?: Record<string, unknown> | null }): string | null {
  if (shape.type !== 'frame') return null;
  const id = shape.meta?.groupId;
  return typeof id === 'string' && id.length > 0 ? id : null;
}

/** 只有带业务 groupId 的 frame 才参与 space 分组同步。原生 tldraw frame 是自由画板内容。 */
export function isBusinessGroupFrame(shape: { type: string; meta?: Record<string, unknown> | null }): boolean {
  return groupIdOfFrame(shape) !== null;
}

/** 组框内部是空心的，点在空白处不会命中 frame。按页面范围从前景到背景找组。 */
export function groupIdAtPoint(
  frames: Array<{ groupId: string | null; x: number; y: number; w: number; h: number }>,
  point: { x: number; y: number },
): string | null {
  for (const frame of frames) {
    if (!frame.groupId) continue;
    const inside = point.x >= frame.x && point.x <= frame.x + frame.w
      && point.y >= frame.y && point.y <= frame.y + frame.h;
    if (inside) return frame.groupId;
  }
  return null;
}

export function groupIdAtPagePoint(editor: Editor, point: { x: number; y: number }): string | null {
  const frames = editor.getCurrentPageShapesSorted().filter((shape) => shape.type === 'frame');
  const frontFirst = [...frames].reverse();
  return groupIdAtPoint(frontFirst.map((frame) => {
    const bounds = editor.getShapePageBounds(frame);
    const props = frame.props as { w?: number; h?: number };
    return {
      groupId: groupIdOfFrame(frame),
      x: bounds?.x ?? frame.x,
      y: bounds?.y ?? frame.y,
      w: bounds?.w ?? props.w ?? 0,
      h: bounds?.h ?? props.h ?? 0,
    };
  }), point);
}
