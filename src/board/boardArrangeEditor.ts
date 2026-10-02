import type { Editor, TLParentId, TLShape, TLShapeId } from 'tldraw';
import { getBoardTasks } from './taskSnapshot';
import {
  arrangeBoard,
  arrangeInsideFrame,
  type ArrangeBoardPlan,
  type ArrangeCluster,
  type ArrangeGroupInput,
  type ArrangeNode,
} from './boardArrange';
import { folderKeyOf } from '@/domain/folderKey';
import { useBoardLayoutStore } from './boardLayoutStore';
import { emitBoardPluginEvent } from './plugins/runtime';
import { TERMINAL_DEFAULT_H, TERMINAL_DEFAULT_W } from './boardPlacement';
import { FRAME_PAD, frameHeadingPageHeight } from './groupFrame';
import { isBusinessGroupFrame } from './boardShapes';

interface Measured {
  id: TLShapeId;
  taskId: string;
  nodeId: string;
  project: string;
  agentKind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
  parentFrameId: TLShapeId | null;
  insideNativeFrame: boolean;
}

function measure(editor: Editor, shape: TLShape): Measured {
  const bounds = editor.getShapePageBounds(shape);
  const props = shape.props as { w?: number; h?: number; taskId?: string; nodeId?: string; project?: string };
  const parent = editor.getShape(shape.parentId);
  return {
    id: shape.id,
    taskId: props.taskId ?? '',
    nodeId: props.nodeId ?? '',
    project: props.project ?? '',
    agentKind: (props as { agentKind?: string }).agentKind ?? '',
    x: bounds?.x ?? shape.x,
    y: bounds?.y ?? shape.y,
    w: props.w ?? bounds?.w ?? 0,
    h: props.h ?? bounds?.h ?? 0,
    locked: shape.isLocked,
    parentFrameId: parent && isBusinessGroupFrame(parent) ? parent.id : null,
    insideNativeFrame: parent?.type === 'frame' && !isBusinessGroupFrame(parent),
  };
}

function nodeOf(shape: Measured): ArrangeNode {
  return { id: shape.id, x: shape.x, y: shape.y, w: shape.w, h: shape.h };
}

function clusterFor(card: Measured, terminals: Measured[]): ArrangeCluster | null {
  if (card.locked) return null;
  const movableTerminals = terminals.filter((terminal) => !terminal.locked);
  const task = getBoardTasks().get(card.taskId);
  return {
    folder: folderKeyOf({ workingDir: task?.workingDir, project: task?.project || card.project }),
    agentKind: task?.agentKind || card.agentKind,
    card: nodeOf(card),
    terminals: movableTerminals.map(nodeOf),
    reservedTerminal: movableTerminals.length === 0
      ? { w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H }
      : undefined,
  };
}

function readPage(editor: Editor) {
  const shapes = editor.getCurrentPageShapes();
  const cards = shapes.filter((shape) => shape.type === 'task-card').map((shape) => measure(editor, shape));
  const terminals = shapes.filter((shape) => shape.type === 'terminal').map((shape) => measure(editor, shape));
  const terminalsByTask = new Map<string, Measured[]>();
  for (const terminal of terminals) {
    if (!terminal.nodeId) continue;
    const list = terminalsByTask.get(terminal.nodeId);
    if (list) list.push(terminal);
    else terminalsByTask.set(terminal.nodeId, [terminal]);
  }
  const frames = shapes.filter((shape) => isBusinessGroupFrame(shape));
  return { cards, terminalsByTask, frames };
}

function clustersIn(cards: Measured[], terminalsByTask: Map<string, Measured[]>): ArrangeCluster[] {
  const clusters: ArrangeCluster[] = [];
  for (const card of cards) {
    const cluster = clusterFor(card, terminalsByTask.get(card.taskId) ?? []);
    if (cluster) clusters.push(cluster);
  }
  return clusters;
}

function applyPlan(
  editor: Editor,
  plan: ArrangeBoardPlan,
  label: string,
  moveFrames: boolean,
  recordHistory = true,
) {
  if (plan.frames.length === 0 && plan.shapes.length === 0) return false;
  const pageId = editor.getCurrentPageId();
  if (recordHistory) editor.markHistoryStoppingPoint(label);
  editor.run(() => {
    for (const shape of plan.shapes) {
      const current = editor.getShape(shape.id as TLShapeId);
      if (!current) continue;
      const parentId = (shape.parentId ?? pageId) as TLParentId;
      if (current.parentId !== parentId) editor.reparentShapes([current.id], parentId);
    }
    const shapeUpdates = [];
    for (const shape of plan.shapes) {
      const current = editor.getShape(shape.id as TLShapeId);
      if (!current) continue;
      shapeUpdates.push({ id: current.id, type: current.type, x: shape.x, y: shape.y });
    }
    if (shapeUpdates.length > 0) editor.updateShapes(shapeUpdates);
    if (plan.frames.length > 0) {
      editor.updateShapes(plan.frames.map((frame) => ({
        id: frame.id as TLShapeId,
        type: 'frame' as const,
        ...(moveFrames ? { x: frame.x, y: frame.y } : {}),
        props: { w: frame.w, h: frame.h },
      })));
    }
  });
  return true;
}

/** 整理整块画板。不看当前选中了什么。 */
export function arrangeWholeBoard(editor: Editor): boolean {
  const { cards, terminalsByTask, frames } = readPage(editor);
  const groups: ArrangeGroupInput[] = frames.map((frame) => {
    const bounds = editor.getShapePageBounds(frame);
    return {
      id: frame.id,
      x: bounds?.x ?? frame.x,
      y: bounds?.y ?? frame.y,
      clusters: clustersIn(cards.filter((card) => card.parentFrameId === frame.id), terminalsByTask),
    };
  });
  const ungrouped = clustersIn(
    cards.filter((card) => card.parentFrameId === null && !card.insideNativeFrame),
    terminalsByTask,
  );
  if (groups.length === 0 && ungrouped.length === 0) return false;
  const perRow = useBoardLayoutStore.getState().agentsPerRow;
  const titleClearance = frameHeadingPageHeight(editor.getZoomLevel());
  const changed = applyPlan(
    editor,
    arrangeBoard({ groups, ungrouped, perRow, titleClearance }),
    '整理画板',
    true,
  );
  if (changed) emitBoardPluginEvent({ type: 'arrange-completed', scope: 'board' });
  return changed;
}

export interface ArrangeGroupFrameOptions {
  /** 自动插入后收回临时扩张，但继续容纳文字、便签等非 Agent 内容。 */
  preserveUnmanagedContent?: boolean;
  /** 用户主动整理才单独建立撤销边界。 */
  recordHistory?: boolean;
  emitEvent?: boolean;
}

/** 只整理一个组的内部。组在画板上的位置不动。 */
export function arrangeGroupFrame(
  editor: Editor,
  frameId: TLShapeId,
  options: ArrangeGroupFrameOptions = {},
): boolean {
  const frame = editor.getShape(frameId);
  if (!frame || !isBusinessGroupFrame(frame)) return false;
  const { cards, terminalsByTask } = readPage(editor);
  const perRow = useBoardLayoutStore.getState().agentsPerRow;
  const inside = arrangeInsideFrame(
    clustersIn(cards.filter((card) => card.parentFrameId === frameId), terminalsByTask),
    perRow,
  );
  if (!inside) return false;
  let unmanagedWidth = 0;
  let unmanagedHeight = 0;
  if (options.preserveUnmanagedContent) {
    for (const childId of editor.getSortedChildIdsForParent(frameId)) {
      const child = editor.getShape(childId);
      if (!child || child.type === 'task-card' || child.type === 'terminal' || child.type === 'arrow') continue;
      const bounds = editor.getShapeGeometry(child).bounds;
      unmanagedWidth = Math.max(unmanagedWidth, child.x + bounds.x + bounds.width + FRAME_PAD);
      unmanagedHeight = Math.max(unmanagedHeight, child.y + bounds.y + bounds.height + FRAME_PAD);
    }
  }
  const plan: ArrangeBoardPlan = {
    frames: [{
      id: frameId,
      x: frame.x,
      y: frame.y,
      w: Math.max(inside.w, unmanagedWidth),
      h: Math.max(inside.h, unmanagedHeight),
    }],
    shapes: inside.placements.map((placement) => ({ ...placement, parentId: frameId })),
  };
  const changed = applyPlan(
    editor,
    plan,
    '整理这个组',
    false,
    options.recordHistory ?? true,
  );
  if (changed && (options.emitEvent ?? true)) {
    emitBoardPluginEvent({ type: 'arrange-completed', scope: 'group', frameId });
  }
  return changed;
}
