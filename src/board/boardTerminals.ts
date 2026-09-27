import { useSyncExternalStore } from 'react';
import { createShapeId, type Editor, type TLParentId, type TLShapeId } from 'tldraw';
import type { TerminalClient } from '@bohemian/terminal-client';
import {
  type TerminalCreateOptions,
  type TerminalInfo,
} from '@bohemian/terminal-protocol';
import type { CanvasTerminalNode } from '@bohemian/terminal-canvas';
import { expandFrameToChildren, findTaskShape } from './boardSync';
import { taskToCardProps, cardPropsChanged, type TaskCardShapeProps } from './TaskCardShape';
import { getBoardTasks } from './taskSnapshot';
import { useSpaceStore } from '@/space/spaceStore';
import { useWorkspaceStore } from '@/workspace/workspaceStore';
import { sessionResumeCommand, sessionStartCommand } from './copySession';
import { NODE_LINK_ROLE, nodeLinkArrow } from './events/boardNodeGraph';
import { boundSessionId, terminalMatchesIdentity } from '@/domain/terminalIdentity';
import { isLiveSuppressed, suppressLiveSession } from './terminalLive';
export { boundSessionId, terminalMatchesIdentity } from '@/domain/terminalIdentity';
import { setBoardTerminalApi } from './terminalApi';
export type { BoardTerminalApi } from './terminalApi';
export { getBoardTerminalApi, setBoardTerminalApi } from './terminalApi';
export { isLiveSuppressed, suppressLiveSession } from './terminalLive';
import type { BoardTerminalApi } from './terminalApi';
import {
  getBoardTerminalInfo,
  getBoardTerminalInfos,
  setBoardTerminalInfos,
  setBoardInventoryLoaded,
  useBoardInventoryLoaded,
  useBoardTaskProcessState,
  useBoardAgentActivity,
  useBoardTerminalInfo,
} from './terminalActivity';
export {
  getBoardTerminalInfo,
  setBoardTerminalInfos,
  setBoardInventoryLoaded,
  useBoardInventoryLoaded,
  useBoardTaskProcessState,
  useBoardAgentActivity,
  useBoardTerminalInfo,
} from './terminalActivity';

export const TERMINAL_SHAPE_TYPE = 'terminal' as const;
export const TERMINAL_DEFAULT_W = 720;
export const TERMINAL_DEFAULT_H = 440;

export type TerminalSplitDirection = 'horizontal' | 'vertical';

let client: TerminalClient | null = null;
const clientListeners = new Set<() => void>();
const openingByNode = new Map<string, Promise<string | null>>();

export function setBoardTerminalClient(next: TerminalClient | null) {
  client = next;
  clientListeners.forEach((listener) => listener());
}

export function useBoardTerminalClient(): TerminalClient | null {
  return useSyncExternalStore(
    (listener) => {
      clientListeners.add(listener);
      return () => clientListeners.delete(listener);
    },
    () => client,
  );
}

export async function waitForSourceShape(editor: Editor, nodeId: string): Promise<TLShapeId | undefined> {
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const source = sourceShapeForNode(editor, nodeId);
    if (source) return source;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 50));
  }
  return sourceShapeForNode(editor, nodeId);
}
export function openNodeOnce(
  node: CanvasTerminalNode,
  open: (node: CanvasTerminalNode) => Promise<string | null>,
): Promise<string | null> {
  const key = node.sessionId || node.id;
  const current = openingByNode.get(key);
  if (current) return current;
  const next = open(node).finally(() => {
    if (openingByNode.get(key) === next) openingByNode.delete(key);
  });
  openingByNode.set(key, next);
  return next;
}

export function getBoardTerminalClient(): TerminalClient | null {
  return client;
}

export function findTerminalShapeByPty(editor: Editor, terminalId: string) {
  return editor.getCurrentPageShapes().find(
    (shape) => shape.type === TERMINAL_SHAPE_TYPE && (shape.props as { terminalId?: string }).terminalId === terminalId,
  );
}

export function findTerminalShapeForNode(editor: Editor, nodeId: string) {
  const byProp = editor.getCurrentPageShapes().find(
    (shape) => shape.type === TERMINAL_SHAPE_TYPE && (shape.props as { nodeId?: string }).nodeId === nodeId,
  );
  if (byProp) return byProp;
  const live = findLiveTerminalForSession(nodeId);
  return live ? findTerminalShapeByPty(editor, live.id) : undefined;
}

export function findLiveTerminalForSession(sessionId: string): TerminalInfo | undefined {
  for (const info of getBoardTerminalInfos().values()) {
    if (info.status !== 'running') continue;
    if (terminalMatchesIdentity(info, sessionId)) return info;
  }
  return undefined;
}

export function restoreSessionId(ids: Array<string | undefined>): string | undefined {
  for (const info of getBoardTerminalInfos().values()) {
    if (!ids.some((id) => terminalMatchesIdentity(info, id))) continue;
    const bound = boundSessionId(info);
    if (bound) return bound;
  }
  return ids.find((id) => id && !id.startsWith('pending-'));
}

export function rebindTerminalShapes(editor: Editor, fromNodeId: string, toNodeId: string): number {
  if (!fromNodeId || fromNodeId === toNodeId) return 0;
  const updates = editor.getCurrentPageShapes()
    .filter((shape) => shape.type === TERMINAL_SHAPE_TYPE && (shape.props as { nodeId?: string }).nodeId === fromNodeId)
    .map((shape) => ({
      id: shape.id,
      type: TERMINAL_SHAPE_TYPE,
      props: { nodeId: toNodeId },
    }));
  if (updates.length) editor.updateShapes(updates);
  return updates.length;
}

/** Rewrite the launch card in place before space ids change, so sync cannot drop the wire. */
export function rebindLaunchCards(editor: Editor, infos: Iterable<TerminalInfo>): number {
  const tasks = getBoardTasks();
  const updates: Array<{ id: TLShapeId; type: 'task-card'; props: Partial<TaskCardShapeProps> }> = [];
  let rebound = 0;
  for (const info of infos) {
    const from = info.launchId;
    const to = boundSessionId(info);
    if (!from || !to || from === to || !from.startsWith('pending-')) continue;
    const pendingCard = findTaskShape(editor, from);
    const boundCard = findTaskShape(editor, to);
    const cardId = pendingCard ?? boundCard;
    if (cardId) {
      const current = editor.getShape(cardId)?.props as TaskCardShapeProps | undefined;
      const task = tasks.get(to);
      const next = task
        ? { ...taskToCardProps(task, to), w: current?.w ?? taskToCardProps(task, to).w, h: current?.h ?? taskToCardProps(task, to).h }
        : { taskId: to };
      const changed = !current || current.taskId !== to || (task ? cardPropsChanged(current, { ...current, ...next }) : false);
      if (changed) updates.push({ id: cardId, type: 'task-card', props: next });
    }
    if (pendingCard) rebindTerminalShapes(editor, from, to);
    const space = useSpaceStore.getState();
    if (space.groups.some((group) => group.taskIds.includes(from))) {
      space.rebindTaskId(from, to);
      rebound += 1;
    } else if (pendingCard) {
      space.addToGroup(to);
      rebound += 1;
    }
    if (pendingCard || space.groups.some((group) => group.taskIds.includes(from))) {
      useWorkspaceStore.getState().removePending(from);
    }
  }
  if (updates.length) editor.updateShapes(updates);
  return rebound;
}

export async function createTerminalShape(
  editor: Editor,
  options: {
    info: TerminalInfo;
    nodeId?: string;
    beside?: TLShapeId;
    direction?: TerminalSplitDirection;
  },
): Promise<TLShapeId> {
  const beside = options.beside ? editor.getShape(options.beside) : undefined;
  const bounds = (options.beside && editor.getShapePageBounds(options.beside)) || editor.getViewportPageBounds();
  const width = TERMINAL_DEFAULT_W;
  const height = TERMINAL_DEFAULT_H;
  const direction = options.direction ?? (beside ? 'vertical' : 'horizontal');
  let x = bounds.x + (bounds.w - width) / 2;
  let y = bounds.y + (bounds.h - height) / 2;
  if (beside && direction === 'horizontal') {
    x = bounds.x + bounds.w + 48;
    y = bounds.y;
  } else if (beside) {
    x = bounds.x + (bounds.w - width) / 2;
    y = bounds.y + bounds.h + 48;
  }

  let parentId: TLParentId | undefined;
  const frameParent = beside && editor.getShape(beside.parentId)?.type === 'frame'
    ? editor.getShape(beside.parentId)
    : undefined;
  if (frameParent) {
    parentId = frameParent.id;
    const point = editor.getPointInShapeSpace(frameParent, { x, y });
    x = point.x;
    y = point.y;
  }

  const id = createShapeId();
  editor.createShapes([
    {
      id,
      type: TERMINAL_SHAPE_TYPE,
      x,
      y,
      ...(parentId ? { parentId } : {}),
      props: {
        terminalId: options.info.id,
        nodeId: options.nodeId ?? options.info.nodeId ?? '',
        title: options.info.title,
        cwd: options.info.cwd,
        status: options.info.status,
        w: width,
        h: height,
      },
    },
  ]);

  if (options.beside) connectShapes(editor, options.beside, id, direction);
  if (parentId) expandFrameToChildren(editor, parentId as TLShapeId);
  editor.select(id);
  editor.setEditingShape(id);
  return id;
}

export function connectShapes(
  editor: Editor,
  fromId: TLShapeId,
  toId: TLShapeId,
  direction: TerminalSplitDirection,
) {
  if (shapesAlreadyLinked(editor, fromId, toId)) return;
  const arrowId = createShapeId();
  editor.createShapes([{ id: arrowId, ...nodeLinkArrow(fromId, toId) }]);
  const startAnchor = direction === 'vertical' ? { x: 0.5, y: 1 } : { x: 1, y: 0.5 };
  const endAnchor = direction === 'vertical' ? { x: 0.5, y: 0 } : { x: 0, y: 0.5 };
  editor.createBindings([
    {
      type: 'arrow',
      fromId: arrowId,
      toId: fromId,
      props: {
        terminal: 'start',
        normalizedAnchor: startAnchor,
        isExact: false,
        isPrecise: true,
        snap: 'edge',
      },
    },
    {
      type: 'arrow',
      fromId: arrowId,
      toId: toId,
      props: {
        terminal: 'end',
        normalizedAnchor: endAnchor,
        isExact: false,
        isPrecise: true,
        snap: 'edge',
      },
    },
  ]);
}

export function focusTerminalShape(editor: Editor, shapeId: TLShapeId) {
  editor.select(shapeId);
  editor.setEditingShape(shapeId);
  editor.zoomToSelection({ animation: { duration: 220 } });
}

export function sourceShapeForNode(editor: Editor, nodeId?: string): TLShapeId | undefined {
  if (!nodeId) return undefined;
  return findTaskShape(editor, nodeId) ?? findTerminalShapeForNode(editor, nodeId)?.id ?? undefined;
}

function shapesAlreadyLinked(editor: Editor, fromId: TLShapeId, toId: TLShapeId): boolean {
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'arrow') continue;
    const meta = (shape.meta ?? {}) as { role?: string; fromShapeId?: string; toShapeId?: string };
    if (meta.role !== NODE_LINK_ROLE) continue;
    if (meta.fromShapeId === fromId && meta.toShapeId === toId) return true;
  }
  return false;
}

export function resumeCommand(node: CanvasTerminalNode): string | null {
  if (!node.agentKind) return null;
  return sessionResumeCommand(node.agentKind, node.sessionId || node.id) || null;
}

export function launchCommand(node: CanvasTerminalNode): string | null {
  const id = node.sessionId || node.id;
  if (id.startsWith('pending-')) return sessionStartCommand(node.agentKind) || null;
  return resumeCommand(node);
}

export function restoreCommand(node: CanvasTerminalNode): string | null {
  const sessionId = restoreSessionId([node.sessionId, node.id]);
  if (sessionId && node.agentKind) return sessionResumeCommand(node.agentKind, sessionId) || null;
  return launchCommand(node);
}

export type { TerminalCreateOptions };
