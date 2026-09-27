import { createShapeId, type Editor, type TLShapeId } from 'tldraw';
import type { Task } from '@/types';
import i18n from '@/i18n';
import { cardPropsChanged, taskToCardProps, type TaskCardShapeProps } from './TaskCardShape';
export { isBoardSpaceSyncReady, setBoardSpaceSyncReady } from './boardSyncState';

export interface GroupInput {
  id: string;
  name: string;
  taskIds: string[];
}


export const UNGROUPED_ID = 'default';
const PAD = 36;
const TITLE = 32;

function taskIdOf(shape: { type: string; props: Record<string, unknown> }): string | null {
  if (shape.type !== 'task-card') return null;
  const v = shape.props.taskId;
  return typeof v === 'string' ? v : null;
}

function isUngrouped(g: { id: string; name: string }) {
  return g.id === UNGROUPED_ID || g.name === '未分组';
}

/** 找出某 taskId 对应的 task-card shape */
export function findTaskShape(editor: Editor, taskId: string): TLShapeId | null {
  for (const s of editor.getCurrentPageShapes()) {
    if (taskIdOf(s as { type: string; props: Record<string, unknown> }) === taskId) {
      return s.id;
    }
  }
  return null;
}

export function findFrameByGroupId(editor: Editor, groupId: string) {
  return editor.getCurrentPageShapes().find(
    (s) => s.type === 'frame' && (s.meta as { groupId?: string } | null)?.groupId === groupId
  );
}

export function groupIdOfFrame(shape: { type: string; meta?: Record<string, unknown> | null }): string | null {
  if (shape.type !== 'frame') return null;
  const id = shape.meta?.groupId;
  return typeof id === 'string' ? id : null;
}

/**
 * 只撑开、不收缩:子卡片超出 frame 时加宽加高;
 * 顶到左边/标题栏时把子节点往里推,框向左上长。
 */
export function expandFrameToChildren(editor: Editor, frameId: TLShapeId) {
  const frame = editor.getShape(frameId);
  if (!frame || frame.type !== 'frame') return;
  const childIds = editor.getSortedChildIdsForParent(frameId);
  if (childIds.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const id of childIds) {
    const s = editor.getShape(id);
    if (!s) continue;
    const geo = editor.getShapeGeometry(s);
    minX = Math.min(minX, s.x);
    minY = Math.min(minY, s.y);
    maxX = Math.max(maxX, s.x + geo.bounds.width);
    maxY = Math.max(maxY, s.y + geo.bounds.height);
  }
  if (!Number.isFinite(minX)) return;

  const fw = (frame.props as { w: number }).w;
  const fh = (frame.props as { h: number }).h;
  let dx = 0;
  let dy = 0;
  if (minX < PAD) dx = PAD - minX;
  if (minY < TITLE + PAD) dy = TITLE + PAD - minY;
  const needW = maxX + dx + PAD;
  const needH = maxY + dy + PAD;
  const nextW = Math.max(fw, needW);
  const nextH = Math.max(fh, needH);
  if (dx === 0 && dy === 0 && nextW === fw && nextH === fh) return;

  editor.run(() => {
    if (dx !== 0 || dy !== 0) {
      editor.updateShapes(
        childIds.map((id) => {
          const s = editor.getShape(id)!;
          return { id, type: s.type, x: s.x + dx, y: s.y + dy };
        })
      );
    }
    if (nextW !== fw || nextH !== fh) {
      editor.updateShapes([
        { id: frame.id, type: 'frame', props: { w: nextW, h: nextH } },
      ]);
    }
  });
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
) {
  const grown = new Set<TLShapeId>();
  groups.forEach((g, gi) => {
    const frame = isUngrouped(g) ? undefined : findFrameByGroupId(editor, g.id);
    g.taskIds.forEach((taskId, i) => {
      if (findTaskShape(editor, taskId)) return;
      const task = tasksById.get(taskId);
      const props = taskToCardProps(task, taskId);
      if (frame) {
        let x = PAD + (i % 3) * 336;
        let y = TITLE + PAD + Math.floor(i / 3) * 132;
        if (origin) {
          const local = editor.getPointInShapeSpace(frame, origin);
          x = local.x;
          y = local.y;
        }
        editor.createShapes([
          {
            id: createShapeId(),
            type: 'task-card',
            parentId: frame.id,
            x,
            y,
            props,
          },
        ]);
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
      }
    });
  });
  for (const id of grown) expandFrameToChildren(editor, id);
}

/** tasks 到达/更新后,把最新字段写回已有卡片 */
export function refreshTaskCardProps(editor: Editor, tasksById: Map<string, Task>) {
  const updates: Array<{ id: TLShapeId; type: 'task-card'; props: TaskCardShapeProps }> = [];
  for (const s of editor.getCurrentPageShapes()) {
    if (s.type !== 'task-card') continue;
    const taskId = (s.props as TaskCardShapeProps).taskId;
    const task = tasksById.get(taskId);
    if (!task) continue;
    const next = {
      ...(s.props as TaskCardShapeProps),
      ...taskToCardProps(task, taskId),
      w: (s.props as TaskCardShapeProps).w,
      h: (s.props as TaskCardShapeProps).h,
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
    if (s.type !== 'frame') continue;
    const groupId = String((s.meta as { groupId?: string } | null)?.groupId ?? s.id);
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
    if (parent && parent.type === 'frame') continue;
    ungrouped.push(tid);
    seen.add(tid);
  }

  return [{ id: UNGROUPED_ID, name: '未分组', taskIds: ungrouped }, ...named];
}

function nextGroupName(editor: Editor): string {
  const used = new Set(
    editor
      .getCurrentPageShapes()
      .filter((s) => s.type === 'frame')
      .map((s) => String((s.props as { name?: string }).name ?? ''))
  );
  let n = 1;
  while (used.has(i18n.t('board.groupN', { n }))) n += 1;
  return i18n.t('board.groupN', { n });
}

function selectedTaskCards(editor: Editor) {
  return editor.getSelectedShapes().filter((s) => s.type === 'task-card');
}

/**
 * 把当前选中的任务卡编成一组(显式操作:Cmd+G / 右键 / 底栏按钮)。
 * 框选本身不建组;拖到空白也不建组。
 */
export function createGroupFromSelection(editor: Editor): boolean {
  const cards = selectedTaskCards(editor);
  if (cards.length === 0) return false;

  const parentIds = new Set(cards.map((c) => c.parentId));
  if (parentIds.size === 1) {
    const parent = editor.getShape(cards[0].parentId);
    if (parent?.type === 'frame') {
      const childCards = editor
        .getSortedChildIdsForParent(parent.id)
        .map((id) => editor.getShape(id))
        .filter((s) => s?.type === 'task-card');
      if (childCards.length === cards.length) return false;
    }
  }

  const bounds = editor.getSelectionPageBounds();
  if (!bounds) return false;

  editor.markHistoryStoppingPoint('编成一组');
  const frameId = createShapeId();
  const groupId = `g-${Date.now().toString(36)}`;
  editor.createShapes([
    {
      id: frameId,
      type: 'frame',
      x: bounds.x - PAD,
      y: bounds.y - PAD - TITLE,
      props: {
        w: bounds.w + PAD * 2,
        h: bounds.h + PAD * 2 + TITLE,
        name: nextGroupName(editor),
      },
      meta: { groupId },
    },
  ]);
  editor.reparentShapes(
    cards.map((c) => c.id),
    frameId
  );
  editor.select(frameId);
  return true;
}

function ungroupFrame(editor: Editor, frameId: TLShapeId) {
  const children = editor.getSortedChildIdsForParent(frameId);
  if (children.length > 0) {
    editor.reparentShapes(children, editor.getCurrentPageId());
  }
  editor.deleteShapes([frameId]);
}

/** 移出分组:选中的卡回到页面;选中的框解散,卡变游离。不删除卡片。 */
export function ungroupSelection(editor: Editor): boolean {
  const selected = editor.getSelectedShapes();
  const frames = selected.filter((s) => s.type === 'frame');
  const cards = selected.filter((s) => s.type === 'task-card');
  if (frames.length === 0 && cards.length === 0) return false;

  editor.markHistoryStoppingPoint('移出分组');
  const pageId = editor.getCurrentPageId();

  for (const f of frames) ungroupFrame(editor, f.id);

  const toFree = cards.filter((c) => {
    const p = editor.getShape(c.parentId);
    return p?.type === 'frame';
  });
  if (toFree.length > 0) {
    editor.reparentShapes(
      toFree.map((c) => c.id),
      pageId
    );
  }
  return true;
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

export function focusTaskShape(editor: Editor, taskId: string) {
  const id = findTaskShape(editor, taskId);
  if (!id) return;
  editor.select(id);
  editor.zoomToSelection({ animation: { duration: 300 } });
}
