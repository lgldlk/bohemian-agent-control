/**
 * Shared terminal protocol.
 *
 * This file is the only wire-contract used by the terminal server and client.
 * Keep runtime messages small and explicit so the WebSocket layer can remain
 * transport-only.
 */

import type { TerminalAgentStatusDetail } from './agentStatus';

export type TerminalId = string;

export interface TerminalSize {
  cols: number;
  rows: number;
}

export type StartupCommandDelivery = 'direct' | 'shell-ready';

export interface TerminalCreateOptions {
  nodeId?: string;
  /** Stable launch identity for a new thread before the provider assigns a session id. */
  launchId?: string;
  agentKind?: string;
  title?: string;
  /** Provider-specific launch identity used to correlate hooks with this PTY. */
  launchToken?: string;
  startupCommandDelivery?: StartupCommandDelivery;
  startupCommand?: string;
  cwd?: string;
  shell?: string;
  args?: string[];
  env?: Record<string, string>;
  size?: TerminalSize;
}

/** TUI activity from structured Agent events, with OSC title as a stale fallback. */
export type TerminalAgentStatus = 'working' | 'idle' | 'blocked';

export interface TerminalInfo {
  id: TerminalId;
  nodeId?: string;
  launchId?: string;
  agentKind?: string;
  startupCommand?: string;
  launchToken?: string;
  startupCommandDelivery?: StartupCommandDelivery;
  startupStatus?: 'none' | 'pending' | 'delivered' | 'failed';
  incarnationId?: string;
  title: string;
  cwd: string;
  shell: string;
  pid?: number;
  status: 'starting' | 'running' | 'exited';
  /** Live agent state inside the PTY, from OSC 0/2 titles. */
  agentStatus?: TerminalAgentStatus;
  agentDetail?: TerminalAgentStatusDetail;
  /** Active xterm buffer mode observed from the PTY stream. */
  alternateScreen?: boolean;
  /** Session id of the agent process running inside this PTY, if detected. */
  agentSessionId?: string;
  exitCode?: number;
  createdAt: number;
  updatedAt: number;
  size: TerminalSize;
}

export interface TerminalSnapshot {
  terminalId: TerminalId;
  data: string;
  sequence: number;
  sourceEnd?: number;
  truncated: boolean;
  alternateScreen?: boolean;
  scrollbackAnsi?: string;
}

export interface TerminalHistoryEntry {
  terminalId: TerminalId;
  title: string;
  command: string;
  at: number;
}

export interface TerminalSearchMatch {
  terminalId: TerminalId;
  title: string;
  kind: 'command' | 'output';
  excerpt: string;
  at?: number;
}

export interface TerminalRPCMethods {
  'terminal.create': {
    request: TerminalCreateOptions;
    response: TerminalInfo;
  };
  'terminal.write': {
    request: { terminalId: TerminalId; data: string };
    response: { success: boolean };
  };
  'terminal.writeAccepted': {
    request: { terminalId: TerminalId; data: string };
    response: { accepted: boolean };
  };
  'terminal.resize': {
    request: { terminalId: TerminalId; size: TerminalSize };
    response: { success: boolean };
  };
  'terminal.close': {
    request: { terminalId: TerminalId };
    response: { success: boolean };
  };
  'terminal.list': {
    request: Record<string, never>;
    response: { terminals: TerminalInfo[] };
  };
  'terminal.info': {
    request: { terminalId: TerminalId };
    response: { info: TerminalInfo | null };
  };
  'terminal.snapshot': {
    request: { terminalId: TerminalId };
    response: { snapshot: TerminalSnapshot | null };
  };
  'terminal.rename': {
    request: { terminalId: TerminalId; title: string };
    response: { info: TerminalInfo | null };
  };
  'terminal.restart': {
    request: { terminalId: TerminalId };
    response: { info: TerminalInfo | null };
  };
  'terminal.signal': {
    request: { terminalId: TerminalId; signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL' };
    response: { success: boolean };
  };
  'terminal.clearBuffer': {
    request: { terminalId: TerminalId };
    response: { success: boolean };
  };
  'terminal.ack': {
    request: { terminalId: TerminalId; sequence: number };
    response: { success: boolean };
  };
  'terminal.history': {
    request: { terminalId?: TerminalId; limit?: number };
    response: { entries: TerminalHistoryEntry[] };
  };
  'terminal.search': {
    request: { query: string; limit?: number };
    response: { matches: TerminalSearchMatch[] };
  };
}

export type RPCMethod = keyof TerminalRPCMethods;

export interface WSRequestMessage<M extends RPCMethod = RPCMethod> {
  type: 'request';
  id: string;
  method: M;
  params: TerminalRPCMethods[M]['request'];
}

export interface WSResponseMessage {
  type: 'response';
  id: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

export interface TerminalOutputFrame {
  terminalId: TerminalId;
  data: string;
  sequence: number;
  bytes: number;
  sourceStart: number;
  sourceEnd: number;
  connectionGeneration: string;
  deliveryToken: string;
  incarnationId: string;
  foreground: boolean;
  droppedOutput?: boolean;
}

export type TerminalEvent =
  | { type: 'output'; frame: TerminalOutputFrame }
  | { type: 'exit'; terminalId: TerminalId; exitCode: number | null }
  | { type: 'created'; terminal: TerminalInfo }
  | { type: 'updated'; terminal: TerminalInfo }
  | { type: 'closed'; terminalId: TerminalId };

export interface WSEventMessage {
  type: 'event';
  event: TerminalEvent;
}

export interface WSInputMessage {
  type: 'input';
  terminalId: TerminalId;
  data: string;
}

export interface WSAckMessage {
  type: 'ack';
  terminalId: TerminalId;
  sequence: number;
  sourceEnd: number;
  connectionGeneration: string;
  deliveryToken: string;
  incarnationId: string;
}
export interface WSAgentStatusMessage {
  type: 'agent-status';
  terminalId: TerminalId;
  launchToken: string;
  payload: import('./agentStatus').ParsedAgentStatus;
}
export interface WSAckBatchMessage {
  type: 'ack-batch';
  acknowledgements: readonly Omit<WSAckMessage, 'type'>[];
}

export interface WSSubscribeMessage {
  type: 'subscribe';
  id: string;
  channel: 'terminal.output' | 'terminal.events';
  filter?: { terminalId?: TerminalId };
  owner?: boolean;
}

export interface WSUnsubscribeMessage {
  type: 'unsubscribe';
  id: string;
}

export interface WSPingMessage {
  type: 'ping';
  timestamp: number;
}

export interface WSPongMessage {
  type: 'pong';
  timestamp: number;
}

export type WSMessage =
  | WSRequestMessage
  | WSResponseMessage
  | WSEventMessage
  | WSInputMessage
  | WSAckMessage
  | WSAckBatchMessage
  | WSAgentStatusMessage
  | WSSubscribeMessage
  | WSUnsubscribeMessage
  | WSPingMessage
  | WSPongMessage;

// Backwards-compatible aliases for callers that used the old names.
export type RPCRequest = WSRequestMessage;
export type RPCResponse = WSResponseMessage;
export type RPCEvent = WSEventMessage;
export type PtySpawnOptions = TerminalCreateOptions;
export type TerminalClientMessage = WSRequestMessage | WSInputMessage | WSAckMessage | WSAckBatchMessage | WSAgentStatusMessage | WSSubscribeMessage | WSUnsubscribeMessage;
export type TerminalServerMessage = WSResponseMessage | WSEventMessage;
