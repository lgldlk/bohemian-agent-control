import type { Editor, TLShapeId } from 'tldraw';

export const NODE_LINK_ROLE = 'node-link';

export function nodeLinkArrow(fromId: TLShapeId, toId: TLShapeId) {
  return {
    type: 'arrow' as const,
    props: {
      kind: 'elbow' as const,
      color: 'grey' as const,
      size: 's' as const,
      dash: 'solid' as const,
      fill: 'none' as const,
      arrowheadStart: 'none' as const,
      arrowheadEnd: 'arrow' as const,
      bend: 0,
    },
    meta: {
      role: NODE_LINK_ROLE,
      fromShapeId: fromId,
      toShapeId: toId,
    },
  };
}

export function findTerminalsForAgent(editor: Editor, nodeId: string) {
  return editor.getCurrentPageShapes().filter(
    (shape) => shape.type === 'terminal' && (shape.props as { nodeId?: string }).nodeId === nodeId,
  );
}

/**
 * 删除后回收无意义连接。
 * tldraw 会先拆 binding 再删 shape，所以不能靠 getBindingsToShape(已删节点)。
 * 规则：node-link 箭头只要少了一端（binding < 2，或 meta 指向已删/将删节点）就删掉。
 */
export function collectDependentShapeIds(
  editor: Editor,
  deleted: { id: TLShapeId; type: string; props: object },
): TLShapeId[] {
  const ids = new Set<TLShapeId>();
  const touch = new Set<TLShapeId>([deleted.id]);

  if (deleted.type === 'task-card' && 'taskId' in deleted.props && typeof deleted.props.taskId === 'string') {
    if (deleted.props.taskId) {
      for (const terminal of findTerminalsForAgent(editor, deleted.props.taskId)) {
        ids.add(terminal.id);
        touch.add(terminal.id);
      }
    }
  }

  for (const id of touch) {
    if (!editor.getShape(id)) continue;
    for (const binding of editor.getBindingsToShape(id, 'arrow')) {
      ids.add(binding.fromId);
    }
  }

  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'arrow') continue;
    const meta = (shape.meta ?? {}) as { role?: string; fromShapeId?: string; toShapeId?: string };
    const tagged =
      meta.role === NODE_LINK_ROLE &&
      (touch.has(meta.fromShapeId as TLShapeId) || touch.has(meta.toShapeId as TLShapeId));
    const bindings = editor.getBindingsFromShape(shape.id, 'arrow');
    const leftover = bindings.map((binding) => editor.getShape(binding.toId)).find(Boolean);
    const dangling =
      bindings.length < 2 &&
      (meta.role === NODE_LINK_ROLE || leftover?.type === 'task-card' || leftover?.type === 'terminal');
    if (tagged || dangling) ids.add(shape.id);
  }

  ids.delete(deleted.id);
  return [...ids].filter((id) => editor.getShape(id));
}
