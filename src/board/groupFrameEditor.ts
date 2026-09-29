import { createShapeId, type Editor, type TLShapeId } from 'tldraw';
import i18n from '@/i18n';
import { useSpaceStore } from '@/space/spaceStore';
import { FRAME_DEFAULT_H, FRAME_DEFAULT_W, FRAME_PAD, FRAME_TITLE, planFrameExpansion, type LocalChild } from './groupFrame';
import { isBusinessGroupFrame } from './boardShapes';

/** 组内任务卡和终端的本地内容盒，不把连线算进去。 */
export function frameContentBoxes(editor: Editor, frameId: TLShapeId) {
  const boxes = [];
  for (const id of editor.getSortedChildIdsForParent(frameId)) {
    const shape = editor.getShape(id);
    if (!shape || shape.type === 'arrow') continue;
    const bounds = editor.getShapeGeometry(shape).bounds;
    boxes.push({
      x: shape.x + bounds.x,
      y: shape.y + bounds.y,
      w: bounds.width,
      h: bounds.height,
    });
  }
  return boxes;
}

/**
 * 把分组框规则应用到 editor。
 * 只撑开、不收缩，且不改 agent 的页面位置。
 */
export function createNamedGroupFrameAtPoint(
  editor: Editor,
  groupId: string,
  name: string,
  point: { x: number; y: number },
): TLShapeId {
  const frameId = createShapeId();
  editor.createShapes([{
    id: frameId,
    type: 'frame',
    x: point.x,
    y: point.y,
    props: { w: FRAME_DEFAULT_W, h: FRAME_DEFAULT_H, name },
    meta: { groupId },
  }]);
  return frameId;
}

export function createEmptyBusinessGroupAtPoint(
  editor: Editor,
  point: { x: number; y: number },
): TLShapeId | null {
  const name = nextGroupName(editor);
  const groupId = useSpaceStore.getState().createGroup(name);
  if (!groupId) return null;
  const frameId = createNamedGroupFrameAtPoint(editor, groupId, name, point);
  editor.select(frameId);
  editor.setEditingShape(frameId);
  return frameId;
}

export function expandFrameToChildren(editor: Editor, frameId: TLShapeId, extra: LocalChild[] = []) {
  const frame = editor.getShape(frameId);
  if (!frame || !isBusinessGroupFrame(frame)) return;
  const childIds = [...editor.getSortedChildIdsForParent(frameId)];
  const children = [...frameContentBoxes(editor, frameId), ...extra];
  if (children.length === 0) return;

  const props = frame.props as { w: number; h: number };
  const plan = planFrameExpansion(
    { x: frame.x, y: frame.y, w: props.w, h: props.h },
    children,
  );
  if (!plan) return;

  editor.run(() => {
    if (plan.childDx !== 0 || plan.childDy !== 0) {
      const updates = [];
      for (const id of childIds) {
        const shape = editor.getShape(id);
        if (!shape) continue;
        updates.push({
          id,
          type: shape.type,
          x: shape.x + plan.childDx,
          y: shape.y + plan.childDy,
        });
      }
      if (updates.length > 0) editor.updateShapes(updates);
    }
    editor.updateShapes([
      {
        id: frame.id,
        type: 'frame',
        x: plan.frame.x,
        y: plan.frame.y,
        props: { w: plan.frame.w, h: plan.frame.h },
      },
    ]);
  });
}

function nextGroupName(editor: Editor): string {
  const used = new Set([
    ...useSpaceStore.getState().groups.map((group) => group.name),
    ...editor.getCurrentPageShapes()
      .filter((shape) => isBusinessGroupFrame(shape))
      .map((shape) => String((shape.props as { name?: string }).name ?? '')),
  ]);
  let n = 1;
  while (used.has(i18n.t('board.groupN', { n }))) n += 1;
  return i18n.t('board.groupN', { n });
}

/** 把当前选中的任务卡编成一组。框选本身不建组。 */
export function createGroupFromSelection(editor: Editor): boolean {
  const cards = editor.getSelectedShapes().filter((shape) => shape.type === 'task-card');
  if (cards.length === 0) return false;
  const parentIds = new Set(cards.map((card) => card.parentId));
  if (parentIds.size === 1) {
    const parent = editor.getShape(cards[0].parentId);
    if (parent && isBusinessGroupFrame(parent)) {
      const childCards = editor.getSortedChildIdsForParent(parent.id)
        .map((id) => editor.getShape(id))
        .filter((shape) => shape?.type === 'task-card');
      if (childCards.length === cards.length) return false;
    }
  }
  const bounds = editor.getSelectionPageBounds();
  if (!bounds) return false;
  editor.markHistoryStoppingPoint('编成一组');
  const frameId = createShapeId();
  editor.createShapes([{
    id: frameId,
    type: 'frame',
    x: bounds.x - FRAME_PAD,
    y: bounds.y - FRAME_PAD - FRAME_TITLE,
    props: {
      w: bounds.w + FRAME_PAD * 2,
      h: bounds.h + FRAME_PAD * 2 + FRAME_TITLE,
      name: nextGroupName(editor),
    },
    meta: { groupId: `g-${Date.now().toString(36)}` },
  }]);
  editor.reparentShapes(cards.map((card) => card.id), frameId);
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
  const frames = selected.filter((shape) => isBusinessGroupFrame(shape));
  const cards = selected.filter((shape) => shape.type === 'task-card');
  if (frames.length === 0 && cards.length === 0) return false;

  editor.markHistoryStoppingPoint('移出分组');
  const pageId = editor.getCurrentPageId();
  for (const frame of frames) ungroupFrame(editor, frame.id);

  const toFree = cards.filter((card) => {
    const parent = editor.getShape(card.parentId);
    return Boolean(parent && isBusinessGroupFrame(parent));
  });
  if (toFree.length > 0) editor.reparentShapes(toFree.map((card) => card.id), pageId);
  return true;
}
