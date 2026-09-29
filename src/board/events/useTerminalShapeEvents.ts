import { useCallback, useLayoutEffect, useRef } from 'react';
import type { TLShapeId } from 'tldraw';
import {
  resolveTerminalAppearance,
  useTerminalAppearance,
} from '@bohemian/terminal-ui/appearance';
import type { TerminalHandle, TerminalRuntimePhase } from '@bohemian/terminal-ui/terminal';
import { observedProcessState } from '@/domain/terminalIdentity';
import { projectCardStatus, isRunningPhase } from '@/lib/boardStatus';
import { focusAgentInput, isAgentInputReady } from '../agentInputFocus';
import { useBoardTerminalClient } from '../boardTerminals';
import { getBoardTerminalApi } from '../terminalApi';
import {
  useBoardAgentActivity,
  useBoardInventoryLoaded,
  useBoardTaskProcessState,
  useBoardTerminalInfo,
} from '../terminalActivity';
import { useBoardNodeEvents } from './useBoardNodeEvents';

const TERMINAL_CHROME = 'button, summary, .tl-terminal__menu';

interface TerminalShapeLike {
  id: TLShapeId;
  props: {
    terminalId: string;
    nodeId: string;
    title: string;
    cwd: string;
    status: string;
    w: number;
    h: number;
  };
}

/** 终端节点事件：父级 BoardNodeEvents + 分屏/重启/关闭。 */
export function useTerminalShapeEvents(
  shape: TerminalShapeLike,
  runtimePhase: TerminalRuntimePhase,
) {
  const handleRef = useRef<TerminalHandle>(null);
  const appearance = useTerminalAppearance();
  const resolved = resolveTerminalAppearance(appearance);
  const live = useBoardTerminalInfo(shape.props.terminalId);
  const client = useBoardTerminalClient();
  const inventoryLoaded = useBoardInventoryLoaded();
  const missing = inventoryLoaded && !live;
  const nodeId = live?.agentSessionId || live?.nodeId || shape.props.nodeId;
  const processState = useBoardTaskProcessState(nodeId);
  const processLive = processState === 'running';
  const agentStatus = useBoardAgentActivity(nodeId) ?? live?.agentStatus;
  const card = projectCardStatus({
    processState: observedProcessState({ running: processLive, missing, status: live?.status }),
    activity: agentStatus,
  });
  const boardStatus = card.task;
  const shapeId = shape.id;
  const terminalId = shape.props.terminalId;
  const agentKind = live?.agentKind;
  const terminalStatus = live?.status || shape.props.status;
  const focusPendingRef = useRef(false);
  const wasEditingRef = useRef(false);

  const focus = useCallback(() => {
    const target = handleRef.current;
    if (!target) return;
    if (!focusAgentInput(agentKind, target)) target.focus();
  }, [agentKind]);
  const blur = useCallback(() => handleRef.current?.blur(), []);

  const node = useBoardNodeEvents(shapeId, {
    editable: true,
    captureBody: true,
    captureWheel: true,
    chromeSelector: TERMINAL_CHROME,
    focus,
    blur,
  });

  const splitRight = useCallback(() => {
    void getBoardTerminalApi()?.split(shapeId, 'horizontal');
  }, [shapeId]);
  const splitDown = useCallback(() => {
    void getBoardTerminalApi()?.split(shapeId, 'vertical');
  }, [shapeId]);
  const find = useCallback(() => handleRef.current?.openSearch(), []);
  const copy = useCallback(() => void handleRef.current?.copy(), []);
  const paste = useCallback(() => void handleRef.current?.paste(), []);
  const clear = useCallback(() => void handleRef.current?.clear(), []);
  const restart = useCallback(() => {
    void getBoardTerminalApi()?.restart(terminalId);
  }, [terminalId]);
  const close = useCallback(() => {
    void getBoardTerminalApi()?.closeShape(shapeId);
  }, [shapeId]);
  const recoverMissing = useCallback(() => {
    void getBoardTerminalApi()?.recoverMissing(shapeId);
  }, [shapeId]);

  useLayoutEffect(() => {
    const becameEditing = node.editing && !wasEditingRef.current;
    wasEditingRef.current = node.editing;
    if (!node.editing) {
      focusPendingRef.current = false;
      return;
    }
    if (!isAgentInputReady(agentKind, terminalStatus, runtimePhase)) {
      focusPendingRef.current = true;
      return;
    }
    if (!becameEditing && !focusPendingRef.current) return;
    focusPendingRef.current = false;
    focus();
  }, [agentKind, focus, node.editing, runtimePhase, terminalStatus]);

  useLayoutEffect(() => {
    handleRef.current?.fit();
  }, [node.editing, resolved.fontFamily, resolved.fontSize, resolved.themeId, shape.props.h, shape.props.w]);

  return {
    ...node,
    handleRef,
    resolved,
    client,
    terminalInfo: live,
    taskRunning: isRunningPhase(card.task),
    agentStatus,
    boardStatus,
    blocked: card.task === 'blocked',
    title: live?.title || shape.props.title,
    cwd: live?.cwd || shape.props.cwd,
    status: terminalStatus,
    onFocus: node.onActivate,
    onBarPointerDown: node.onChromePointerDown,
    missing,
    actions: { splitRight, splitDown, find, copy, paste, clear, restart, recoverMissing, close },
  };
}
