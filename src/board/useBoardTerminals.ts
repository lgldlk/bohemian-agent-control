import { useEffect, useRef } from 'react';
import { createRafScheduler } from '@/lib/timing';
import { type Editor, type TLShapeId } from 'tldraw';
import type { TerminalClient } from '@bohemian/terminal-client';
import { useTerminalManager } from '@bohemian/terminal-ui/manager';
import type { CanvasTerminalNode } from '@bohemian/terminal-canvas';
import { collectDependentShapeIds } from './events/boardNodeGraph';
import { terminalMatchesIdentity } from '@/domain/terminalIdentity';
import { findTaskShape } from './boardShapes';
import { setBoardTerminalApi, type BoardTerminalApi } from './terminalApi';
import { suppressLiveSession } from './terminalLive';
import { rebindLaunchCards } from './rebindLaunch';
import { getBoardTerminalInfos, setBoardInventoryLoaded, setBoardTerminalInfos } from './terminalActivity';
import { emitBoardPluginEvent } from './plugins/runtime';
import {
  createTerminalShape,
  findLiveTerminalForSession,
  findTerminalShapeByPty,
  findTerminalShapeForNode,
  focusTerminalShape,
  openNodeOnce,
  launchCommand,
  restoreCommand,
  restoreSessionId,
  setBoardTerminalClient,
  waitForSourceShape,
  sourceShapeForNode,
  TERMINAL_SHAPE_TYPE,
  type TerminalSplitDirection,
} from './boardTerminals';

export function useBoardTerminals(client: TerminalClient, editor: Editor | null) {
  const manager = useTerminalManager(client);
  const { createTerminal, closeTerminal, restartTerminal, renameTerminal, terminals, inventoryLoaded } = manager;
  const terminalsRef = useRef(terminals);
  const terminalTopology = terminals
    .map((terminal) => `${terminal.id}:${terminal.info.status}:${terminal.info.nodeId ?? ''}:${terminal.info.agentSessionId ?? ''}:${terminal.info.launchId ?? ''}`)
    .sort()
    .join('|');
  terminalsRef.current = terminals;

  useEffect(() => {
    setBoardTerminalClient(client);
    return () => setBoardTerminalClient(null);
  }, [client]);

  useEffect(() => {
    setBoardInventoryLoaded(inventoryLoaded);
  }, [inventoryLoaded]);


  useEffect(() => {
    return client.subscribeToEvents((event) => {
      if (event.type === 'created') {
        emitBoardPluginEvent({ type: 'terminal-opened', terminalId: event.terminal.id, taskId: event.terminal.nodeId });
        return;
      }
      if (event.type === 'closed') {
        emitBoardPluginEvent({ type: 'terminal-closed', terminalId: event.terminalId });
        return;
      }
      if (event.type !== 'updated') return;
      emitBoardPluginEvent({
        type: 'terminal-status-changed',
        terminalId: event.terminal.id,
        status: event.terminal.status,
      });
      const previousInfos = getBoardTerminalInfos();
      const next = new Map(previousInfos);
      next.set(event.terminal.id, event.terminal);
      setBoardTerminalInfos(next);
      if (editor && event.terminal.agentSessionId) {
        rebindLaunchCards(editor, [event.terminal], previousInfos);
      }
    });
  }, [client, editor]);

  useEffect(() => {
    if (!editor || !inventoryLoaded) return;
    const reconcile = async () => {
      if (client.getConnectionState() !== 'connected') return;
      const serverInfos = await client.listTerminals();
      const previousInfos = getBoardTerminalInfos();
      setBoardTerminalInfos(new Map(serverInfos.map((info) => [info.id, info])));
      rebindLaunchCards(editor, serverInfos, previousInfos);
      const available = new Set(serverInfos.map((info) => info.id));
      const missing = editor.getCurrentPageShapes()
        .filter((shape) => shape.type === TERMINAL_SHAPE_TYPE)
        .filter((shape) => !available.has((shape.props as { terminalId: string }).terminalId));
      for (const shape of missing) {
        const props = shape.props as { terminalId: string; nodeId: string };
        const replacement = serverInfos.find((info) =>
          info.status === 'running' && terminalMatchesIdentity(info, props.nodeId),
        );
        if (replacement) {
          // Rebind in place. Deleting and recreating the shape can trigger
          // tldraw's delete side effects and makes a transient inventory gap
          // look like a user-initiated terminal close.
          editor.updateShapes([{
            id: shape.id,
            type: TERMINAL_SHAPE_TYPE,
            props: {
              terminalId: replacement.id,
              nodeId: props.nodeId,
              title: replacement.title,
              cwd: replacement.cwd,
              status: replacement.status,
            },
          }]);
        }
        // A missing inventory entry is not proof that the PTY was closed:
        // archives may be temporarily unavailable during reconnect/startup.
        // Keep the shape mounted so the missing overlay can offer recovery.
      }
    };
    const scheduler = createRafScheduler(() => void reconcile());
    scheduler.schedule();
    const unsubscribe = editor.store.listen((entry) => {
      if (Object.values(entry.changes.added).some((record) => record.typeName === 'shape' && record.type === TERMINAL_SHAPE_TYPE)) {
        scheduler.schedule();
      }
    }, { scope: 'document' });
    return () => {
      scheduler.cancel();
      unsubscribe();
    };
  }, [client, editor, inventoryLoaded, terminalTopology]);

  useEffect(() => {
    if (!editor) {
      setBoardTerminalApi(null);
      return;
    }

    const attachExisting = async (node: CanvasTerminalNode) => {
      const identities = [node.sessionId, node.id, restoreSessionId([node.sessionId, node.id])].filter((id): id is string => Boolean(id));
      for (const id of identities) {
        const existing = findTerminalShapeForNode(editor, id);
        if (existing) {
          const terminalId = (existing.props as { terminalId: string }).terminalId;
          const info = getBoardTerminalInfos().get(terminalId);
          if (info?.status === 'exited') await restartTerminal(terminalId);
          focusTerminalShape(editor, existing.id);
          return terminalId;
        }
      }
      const live = identities.map((id) => findLiveTerminalForSession(id)).find(Boolean);
      if (!live) return null;
      const shape = findTerminalShapeByPty(editor, live.id);
      if (shape) {
        focusTerminalShape(editor, shape.id);
        return live.id;
      }
      await createTerminalShape(editor, {
        info: live,
        nodeId: node.id,
        beside: sourceShapeForNode(editor, node.id),
      });
      return live.id;
    };

    const spawn = async (options: {
      node?: CanvasTerminalNode;
      cwd?: string;
      beside?: TLShapeId;
      direction?: TerminalSplitDirection;
      resume?: boolean;
    }) => {
      if (options.node && (!options.node.agentKind || !options.node.cwd)) return null;
      if (options.node && !options.beside) {
        const serverInfos = await client.listTerminals();
        setBoardTerminalInfos(new Map(serverInfos.map((info) => [info.id, info])));
        const attached = await attachExisting(options.node);
        if (attached) return attached;
      }
      const sessionId = options.node ? restoreSessionId([options.node.sessionId, options.node.id]) : undefined;
      const command = options.node
        ? (sessionId && options.node.agentKind ? restoreCommand(options.node) : launchCommand(options.node))
        : undefined;
      const beside = options.beside ?? (options.node
        ? await waitForSourceShape(editor, options.node.id)
        : undefined);
      const created = await createTerminal({
        nodeId: sessionId || options.node?.id,
        launchId: options.node?.id,
        agentKind: options.node?.agentKind,
        startupCommand: command || undefined,
        launchToken: command ? crypto.randomUUID() : undefined,
        startupCommandDelivery: command ? 'shell-ready' : undefined,
        cwd: options.node?.cwd || options.cwd,
        title: options.node?.title ? `${options.node.title} · terminal` : undefined,
      });
      await createTerminalShape(editor, {
        info: created.info,
        nodeId: sessionId || options.node?.id,
        beside,
        direction: options.direction,
      });
      return created.id;
    };

    const next: BoardTerminalApi = {
      openForNode: (node) => openNodeOnce(node, (target) => spawn({ node: target })),
      createFree: (cwd) => spawn({ cwd }),
      split: async (shapeId, direction) => {
        const shape = editor.getShape(shapeId);
        if (shape?.type !== TERMINAL_SHAPE_TYPE) return null;
        const props = shape.props as { terminalId: string; nodeId: string; cwd: string; title: string };
        const source = terminalsRef.current.find((terminal) => terminal.id === props.terminalId)?.info;
        return spawn({
          cwd: source?.cwd || props.cwd,
          beside: shapeId,
          direction,
        });
      },
      recoverMissing: async (shapeId) => {
        const shape = editor.getShape(shapeId);
        if (shape?.type !== TERMINAL_SHAPE_TYPE) return null;
        const props = shape.props as { nodeId: string; cwd: string; title: string };
        const taskShapeId = findTaskShape(editor, props.nodeId);
        const taskShape = taskShapeId ? editor.getShape(taskShapeId) : undefined;
        const agentKind = taskShape?.type === 'task-card'
          ? (taskShape.props as { agentKind?: string }).agentKind
          : undefined;
        const node: CanvasTerminalNode = {
          id: props.nodeId,
          sessionId: props.nodeId,
          cwd: props.cwd,
          title: props.title,
          agentKind,
          live: false,
        };
        editor.deleteShapes([shapeId, ...collectDependentShapeIds(editor, shape)]);
        const liveInfo = (await client.listTerminals()).find((info) =>
          info.status === 'running' && terminalMatchesIdentity(info, props.nodeId),
        );
        if (liveInfo) {
          await createTerminalShape(editor, {
            info: liveInfo,
            nodeId: props.nodeId,
            beside: await waitForSourceShape(editor, props.nodeId),
          });
          return liveInfo.id;
        }
        // openForNode first adopts an existing live PTY for this Agent; only
        // when none exists does spawn create a new terminal process.
        return openNodeOnce(node, (target) => spawn({ node: target }));
      },
      closeShape: async (shapeId) => {
        const shape = editor.getShape(shapeId);
        if (shape?.type !== TERMINAL_SHAPE_TYPE) return;
        const terminalId = (shape.props as { terminalId: string }).terminalId;
        const extra = collectDependentShapeIds(editor, shape);
        const nodeId = (shape.props as { nodeId?: string }).nodeId;
        const info = terminalsRef.current.find((terminal) => terminal.id === terminalId)?.info;
        suppressLiveSession(nodeId || '');
        suppressLiveSession(info?.agentSessionId || '');
        editor.deleteShapes([shapeId, ...extra]);
        await closeTerminal(terminalId).catch(() => false);
      },
      restart: async (terminalId) => {
        await restartTerminal(terminalId);
      },
      rename: async (terminalId, title) => {
        const info = await renameTerminal(terminalId, title);
        const shape = findTerminalShapeByPty(editor, terminalId);
        if (info && shape) {
          editor.updateShapes([{ id: shape.id, type: TERMINAL_SHAPE_TYPE, props: { title: info.title } }]);
        }
      },
      focusTerminal: (terminalId) => {
        const shape = findTerminalShapeByPty(editor, terminalId);
        if (!shape) return false;
        focusTerminalShape(editor, shape.id);
        return true;
      },
      info: (terminalId) => terminalsRef.current.find((terminal) => terminal.id === terminalId)?.info,
    };
    setBoardTerminalApi(next);
    return () => setBoardTerminalApi(null);
  }, [client, closeTerminal, createTerminal, editor, renameTerminal, restartTerminal]);

  useEffect(() => {
    if (!editor) return;
    const updates: Array<{ id: TLShapeId; type: typeof TERMINAL_SHAPE_TYPE; props: { title: string; cwd: string; status: string; nodeId: string } }> = [];
    for (const shape of editor.getCurrentPageShapes()) {
      if (shape.type !== TERMINAL_SHAPE_TYPE) continue;
      const terminalId = (shape.props as { terminalId: string }).terminalId;
      const info = terminals.find((terminal) => terminal.id === terminalId)?.info;
      if (!info) continue;
      const props = shape.props as { title: string; cwd: string; status: string; nodeId: string };
      const nodeId = info.agentSessionId || info.nodeId || props.nodeId;
      if (
        props.title === info.title &&
        props.cwd === info.cwd &&
        props.status === info.status &&
        props.nodeId === nodeId
      ) continue;
      updates.push({
        id: shape.id,
        type: TERMINAL_SHAPE_TYPE,
        props: { title: info.title, cwd: info.cwd, status: info.status, nodeId },
      });
    }
    if (updates.length) editor.updateShapes(updates);
  }, [editor, terminals]);
}
