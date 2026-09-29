import { useSyncExternalStore } from 'react';
import { createShapeId, type Editor, type TLParentId, type TLShapeId } from 'tldraw';
import type { TerminalClient } from '@bohemian/terminal-client';
import {
  type TerminalCreateOptions,
  type TerminalInfo,
} from '@bohemian/terminal-protocol';
import type { CanvasTerminalNode } from '@bohemian/terminal-canvas';
import { findTaskShape, isBusinessGroupFrame } from './boardShapes';
import { placeLikeBoard, TERMINAL_DEFAULT_H, TERMINAL_DEFAULT_W } from './boardPlacement';
import { expandFrameToChildren } from './groupFrameEditor';
import { sessionResumeCommand, sessionStartCommand } from './copySession';
import { NODE_LINK_ROLE, nodeLinkArrow } from './events/boardNodeGraph';
import { boundSessionId, terminalMatchesIdentity } from '@/domain/terminalIdentity';
import type { BoardTerminalApi } from './terminalApi';
import { getBoardTerminalInfos } from './terminalActivity';

export const TERMINAL_SHAPE_TYPE = 'terminal' as const;
export { TERMINAL_DEFAULT_H, TERMINAL_DEFAULT_W };

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

export function waitForSourceShape(editor: Editor, nodeId: string): Promise<TLShapeId | undefined> {
  const current = sourceShapeForNode(editor, nodeId);
  if (current) return Promise.resolve(current);

  return new Promise((resolve) => {
    let frame: number | null = null;
    let remainingFrames = 60;
    let stopped = false;
    let unsubscribe = () => {};

    const finish = (value: TLShapeId | undefined) => {
      if (stopped) return;
      stopped = true;
      if (frame !== null) cancelAnimationFrame(frame);
      unsubscribe();
      resolve(value);
    };
    const check = () => {
      frame = null;
      if (stopped) return;
      const source = sourceShapeForNode(editor, nodeId);
      if (source) {
        finish(source);
        return;
      }
      remainingFrames -= 1;
      if (remainingFrames <= 0) {
        finish(undefined);
        return;
      }
      frame = requestAnimationFrame(check);
    };
    const schedule = () => {
      if (frame === null) frame = requestAnimationFrame(check);
    };

    unsubscribe = editor.store.listen(schedule, { scope: 'document' });
    schedule();
  });
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
  const placed = placeLikeBoard({
    anchor: { x: bounds.x, y: bounds.y, w: bounds.w, h: bounds.h },
    width,
    height,
    beside: Boolean(beside),
    direction,
  });
  let x = placed.x;
  let y = placed.y;

  let parentId: TLParentId | undefined;
  const frameParent = beside && editor.getShape(beside.parentId)?.type === 'frame'
    ? editor.getShape(beside.parentId)
    : undefined;
  if (frameParent) {
    const local = editor.getPointInShapeSpace(frameParent, { x, y });
    parentId = frameParent.id;
    x = local.x;
    y = local.y;
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
  if (parentId && frameParent && isBusinessGroupFrame(frameParent)) {
    expandFrameToChildren(editor, parentId as TLShapeId);
  }
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
