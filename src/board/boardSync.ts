import { createShapeId, type Editor, type TLShapeId } from 'tldraw';
import type { Task } from '@/types';
import i18n from '@/i18n';
import { cardPropsChanged, taskToCardProps, type TaskCardShapeProps } from './TaskCardShape';
import { findFrameByGroupId, findTaskShape, groupIdAtPagePoint, groupIdOfFrame, isBusinessGroupFrame } from './boardShapes';
import { TERMINAL_DEFAULT_H, TERMINAL_DEFAULT_W } from './boardPlacement';
import { FRAME_PAD as PAD, FRAME_TITLE as TITLE, placeAddedAgent, type LocalChild } from './groupFrame';
import { expandFrameToChildren, frameContentBoxes } from './groupFrameEditor';

export interface GroupInput {
  id: string;
  name: string;
  taskIds: string[];
}

export interface SpaceToBoardSyncResult {
  createdTaskIds: string[];
}

export const UNGROUPED_ID = 'default';

function taskIdOf(shape: { type: string; props: Record<string, unknown> }): string | null {
  if (shape.type !== 'task-card') return null;
  const value = shape.props.taskId;
  return typeof value === 'string' ? value : null;
}

function isUngrouped(group: { id: string; name: string }) {
  return group.id === UNGROUPED_ID || group.name === '未分组';
}

/**
 * 同步:保证 space 里的每个 taskId 在白板上都有卡片。
 * 已有的不动(含用户拖出去的游离卡)。新卡:有对应 frame 就进组,否则落在页面上(未分组)。
 */
export function syncSpaceToBoard(
  editor: Editor,
  groups: GroupInput[],
  tasksById: Map<string, Task>,
  origin?: { x: number; y: number }
): SpaceToBoardSyncResult {
  const createdTaskIds: string[] = [];
  const grown = new Set<TLShapeId>();
  const reserved = new Map<TLShapeId, LocalChild[]>();
  const occupied = new Map<TLShapeId, LocalChild[]>();
  groups.forEach((g, gi) => {
    let frame = isUngrouped(g) ? undefined : findFrameByGroupId(editor, g.id);
    if (!frame && origin && isUngrouped(g)) {
      const underClick = groupIdAtPagePoint(editor, origin);
      if (underClick) frame = findFrameByGroupId(editor, underClick);
    }
    g.taskIds.forEach((taskId, i) => {
      if (findTaskShape(editor, taskId)) return;
      const task = tasksById.get(taskId);
      const props = taskToCardProps(task, taskId);
      if (frame) {
        let clickX = PAD + (i % 3) * 336;
        let clickY = TITLE + PAD + Math.floor(i / 3) * 132;
        if (origin) {
          const local = editor.getPointInShapeSpace(frame, origin);
          clickX = local.x;
          clickY = local.y;
        }
        const taken = occupied.get(frame.id) ?? frameContentBoxes(editor, frame.id);
        const placed = placeAddedAgent({
          existing: taken,
          click: { x: clickX, y: clickY },
          card: { w: props.w, h: props.h },
          terminal: { w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H },
        });
        editor.createShapes([
          {
            id: createShapeId(),
            type: 'task-card',
            parentId: frame.id,
            x: placed.card.x,
            y: placed.card.y,
            props,
          },
        ]);
        createdTaskIds.push(taskId);
        occupied.set(frame.id, [...taken, placed.card, placed.terminal]);
        const slot = reserved.get(frame.id) ?? [];
        slot.push(placed.terminal);
        reserved.set(frame.id, slot);
        grown.add(frame.id);
      } else {
        const ox = origin?.x ?? 80;
        const oy = origin?.y ?? 80;
        editor.createShapes([
          {
            id: createShapeId(),
            type: 'task-card',
            x: ox + i * 24,
            y: oy + i * 24,
            props,
          },
        ]);
        createdTaskIds.push(taskId);
      }
    });
  });
  for (const id of grown) expandFrameToChildren(editor, id, reserved.get(id) ?? []);
  return { createdTaskIds };
}

/** tasks 到达/更新后,把最新字段写回已有卡片 */
export function refreshTaskCardProps(editor: Editor, tasksById: Map<string, Task>) {
  const updates: Array<{ id: TLShapeId; type: 'task-card'; props: TaskCardShapeProps }> = [];
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'task-card') continue;
    const taskId = (s.props as TaskCardShapeProps).taskId;
    const task = tasksById.get(taskId);
    if (!task) continue;
    const current = s.props as TaskCardShapeProps;
    const next = {
      ...current,
      ...taskToCardProps(task, taskId),
      customTitle: current.customTitle ?? '',
      w: current.w,
      h: current.h,
    };
    if (cardPropsChanged(s.props as TaskCardShapeProps, next)) {
      updates.push({ id: s.id, type: 'task-card', props: next });
    }
  }
  if (updates.length > 0) editor.updateShapes(updates);
}

export function forceBoardPaint(editor: Editor) {
  const cam = editor.getCamera();
  editor.setCamera({ x: cam.x + 0.01, y: cam.y, z: cam.z });
  editor.setCamera(cam);
}

/**
 * 仅在「命名分组还没有 frame」时建框并把卡片收成子节点。
 * 未分组永不套框。已有 frame 不改尺寸、不把用户拖走的卡拽回来。
 */
export function bootstrapNamedFrames(editor: Editor, groups: GroupInput[]) {
  for (const g of groups) {
    if (isUngrouped(g)) continue;
    if (findFrameByGroupId(editor, g.id)) continue;
    const cardIds = g.taskIds
      .map((id) => findTaskShape(editor, id))
      .filter((id): id is TLShapeId => id !== null);
    if (cardIds.length === 0) continue;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of cardIds) {
      const s = editor.getShape(id);
      if (!s) continue;
      const b = editor.getShapePageBounds(s);
      if (!b) continue;
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }
    if (!Number.isFinite(minX)) continue;

    const frameId = createShapeId();
    editor.createShapes([
      {
        id: frameId,
        type: 'frame',
        x: minX - PAD,
        y: minY - PAD - TITLE,
        props: {
          w: maxX - minX + PAD * 2,
          h: maxY - minY + PAD * 2 + TITLE,
          name: g.name,
        },
        meta: { groupId: g.id },
      },
    ]);
    editor.reparentShapes(cardIds, frameId);
  }
}

/** 从白板读分组:frame 的子卡片 = 组;落在页面上的卡片 = 未分组。拖出框即游离。 */
export function readGroupsFromBoard(editor: Editor): GroupInput[] {
  const named: GroupInput[] = [];
  const seen = new Set<string>();

  for (const s of editor.getCurrentPageShapes()) {
    const groupId = groupIdOfFrame(s);
    if (!groupId) continue;
    const name = String((s.props as { name?: string }).name || i18n.t('board.unnamed'));
    const taskIds: string[] = [];
    for (const cid of editor.getSortedChildIdsForParent(s.id)) {
      const child = editor.getShape(cid);
      if (!child) continue;
      const tid = taskIdOf(child as { type: string; props: Record<string, unknown> });
      if (!tid || seen.has(tid)) continue;
      taskIds.push(tid);
      seen.add(tid);
    }
    named.push({ id: groupId, name, taskIds });
  }

  const ungrouped: string[] = [];
  for (const s of editor.getCurrentPageShapes()) {
    const tid = taskIdOf(s as { type: string; props: Record<string, unknown> });
    if (!tid || seen.has(tid)) continue;
    const parent = editor.getShape(s.parentId);
    if (parent && isBusinessGroupFrame(parent)) continue;
    ungrouped.push(tid);
    seen.add(tid);
  }

  return [{ id: UNGROUPED_ID, name: '未分组', taskIds: ungrouped }, ...named];
}

/** 删除已不在任何分组(含未分组)的 task-card —— 即从空间移除 */
export function pruneOrphanShapes(editor: Editor, aliveTaskIds: Set<string>) {
  const orphans: TLShapeId[] = [];
  for (const s of editor.getCurrentPageShapes()) {
    const taskId = taskIdOf(s as { type: string; props: Record<string, unknown> });
    if (taskId === null) continue;
    if (!aliveTaskIds.has(taskId)) orphans.push(s.id);
  }
  if (orphans.length > 0) editor.deleteShapes(orphans);
}

export function focusTaskShape(editor: Editor, taskId: string): boolean {
  const id = findTaskShape(editor, taskId);
  if (!id) return false;
  editor.select(id);
  editor.zoomToSelection({ animation: { duration: 300 } });
  return true;
}
