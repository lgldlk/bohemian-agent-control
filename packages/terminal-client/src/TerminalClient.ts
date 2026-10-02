import type {
  TerminalCreateOptions,
  TerminalEvent,
  TerminalId,
  TerminalInfo,
  TerminalOutputFrame,
  TerminalRPCMethods,
  TerminalHistoryEntry,
  TerminalSearchMatch,
  TerminalSnapshot,
  WSMessage,
  WSAckMessage,
} from '@bohemian/terminal-protocol';
import { decodeTerminalOutputFrame } from '@bohemian/terminal-protocol';

export type TerminalConnectionState = 'connecting' | 'connected' | 'disconnected';

export interface TerminalClientOptions {
  url: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  reconnectInterval?: number;
}

type OutputCallback = (frame: TerminalOutputFrame) => void;
type OutputRegistration = {
  callback: OutputCallback;
  active: boolean;
};

export interface TerminalOutputSubscription {
  setActive(active: boolean): boolean;
  unsubscribe(): void;
}

type ExitCallback = (code: number | null) => void;
type EventCallback = (event: TerminalEvent) => void;
type ConnectionCallback = (state: TerminalConnectionState) => void;

/** Reconnecting typed client for the terminal WebSocket protocol. */
export class TerminalClient {
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly reconnectInterval: number;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private manuallyDisconnected = false;
  private connectionState: TerminalConnectionState = 'disconnected';
  private requestId = 0;
  private readonly pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: ReturnType<typeof setTimeout>;
  }>();
  private readonly outputCallbacks = new Map<TerminalId, Map<symbol, OutputRegistration>>();
  private readonly subscribedOutputs = new Set<TerminalId>();
  private readonly pendingInput = new Map<TerminalId, string[]>();
  private readonly pendingInputBytes = new Map<TerminalId, number>();
  private readonly pendingAcks: WSAckMessage[] = [];
  private ackTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly exitCallbacks = new Map<TerminalId, Set<ExitCallback>>();
  private readonly eventCallbacks = new Set<EventCallback>();
  private readonly connectionCallbacks = new Set<ConnectionCallback>();

  constructor(options: TerminalClientOptions) {
    this.url = options.url;
    this.reconnectInterval = options.reconnectInterval ?? 1500;
    this.onConnect = options.onConnect;
    this.onDisconnect = options.onDisconnect;
    this.onError = options.onError;
  }

  private readonly onConnect?: () => void;
  private readonly onDisconnect?: () => void;
  private readonly onError?: (error: Error) => void;

  connect(): void {
    this.manuallyDisconnected = false;
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) return;
    this.setConnectionState('connecting');
    try {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        if (this.ws !== ws) {
          ws.close();
          return;
        }
        // Restore output attachments before notifying panes that the transport
        // is connected. Hydration RPCs triggered by that notification must be
        // ordered after their output subscriptions on this socket.
        this.restoreSubscriptions();
        this.setConnectionState('connected');
        this.startHeartbeat();
        this.onConnect?.();
      };
      ws.onmessage = (event) => {
        if (this.ws !== ws) return;
        try {
          if (typeof event.data !== 'string') {
            const frame = decodeTerminalOutputFrame(event.data as ArrayBuffer);
            if (frame) this.outputCallbacks.get(frame.terminalId)?.forEach((registration) => {
              if (registration.active) registration.callback(frame);
            });
            return;
          }
          this.handleMessage(JSON.parse(String(event.data)) as WSMessage);
        } catch (error) {
          this.onError?.(error instanceof Error ? error : new Error('Invalid server message'));
        }
      };
      ws.onclose = () => this.handleDisconnect(ws);
      ws.onerror = () => {
        if (this.ws === ws) this.onError?.(new Error('Terminal WebSocket error'));
      };
    } catch (error) {
      this.onError?.(error instanceof Error ? error : new Error('Failed to connect'));
      this.handleDisconnect(this.ws ?? undefined);
    }
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.reconnectTimer = null;
    this.heartbeatTimer = null;
    this.ws?.close();
    this.ws = null;
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
    this.pendingAcks.length = 0;
    this.subscribedOutputs.clear();
    this.rejectPending(new Error('Terminal client disconnected'));
    this.setConnectionState('disconnected');
  }

  private handleDisconnect(ws?: WebSocket): void {
    // A socket from a previous React effect / reconnect attempt may close
    // after a newer socket has already taken ownership. It must not tear down
    // the current connection or change its state.
    if (ws && this.ws !== ws) return;
    const wasConnected = this.connectionState === 'connected';
    this.ws = null;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
    this.pendingAcks.length = 0;
    this.subscribedOutputs.clear();
    this.rejectPending(new Error('Terminal connection lost'));
    this.setConnectionState('disconnected');
    if (wasConnected) this.onDisconnect?.();
    if (!this.manuallyDisconnected) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, this.reconnectInterval);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping', timestamp: Date.now() });
      }
    }, 15_000);
  }

  private restoreSubscriptions(): void {
    this.send({ type: 'subscribe', id: 'terminal-events', channel: 'terminal.events' });
    for (const terminalId of this.outputCallbacks.keys()) {
      this.ensureOutputSubscription(terminalId);
    }
  }

  private handleMessage(message: WSMessage): void {
    if (message.type === 'response') {
      const pending = this.pendingRequests.get(message.id);
      if (!pending) return;
      this.pendingRequests.delete(message.id);
      clearTimeout(pending.timeout);
      if (message.success) pending.resolve(message.result);
      else pending.reject(new Error(message.error || 'Terminal request failed'));
      return;
    }
    if (message.type !== 'event') return;
    const event = message.event;
    this.eventCallbacks.forEach((callback) => callback(event));
    if (event.type === 'output') {
      const frame = event.frame;
      this.outputCallbacks.get(frame.terminalId)?.forEach((registration) => {
        if (registration.active) registration.callback(frame);
      });
    } else if (event.type === 'exit') {
      this.exitCallbacks.get(event.terminalId)?.forEach((callback) => callback(event.exitCode));
    }
  }

  private send(message: WSMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) throw new Error('Terminal client is not connected');
    this.ws.send(JSON.stringify(message));
  }

  private async waitUntilConnected(timeoutMs = 10_000): Promise<void> {
    if (this.connectionState === 'connected') return;
    this.connect();
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(new Error('Timed out connecting to terminal server'));
      }, timeoutMs);
      const unsubscribe = this.subscribeToConnection((state) => {
        if (state !== 'connected') return;
        clearTimeout(timeout);
        unsubscribe();
        resolve();
      });
    });
  }

  private async request<M extends keyof TerminalRPCMethods>(
    method: M,
    params: TerminalRPCMethods[M]['request'],
  ): Promise<TerminalRPCMethods[M]['response']> {
    await this.waitUntilConnected();
    return new Promise((resolve, reject) => {
      const id = `request-${++this.requestId}`;
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Terminal request timed out: ${String(method)}`));
      }, 30_000);
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject, timeout });
      try {
        this.send({ type: 'request', id, method, params } as WSMessage);
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(id);
        reject(error instanceof Error ? error : new Error('Failed to send request'));
      }
    });
  }

  createTerminal(options: TerminalCreateOptions = {}): Promise<TerminalInfo> {
    return this.request('terminal.create', options);
  }

  async listTerminals(): Promise<TerminalInfo[]> {
    return (await this.request('terminal.list', {})).terminals;
  }

  async getTerminalInfo(terminalId: TerminalId): Promise<TerminalInfo | null> {
    return (await this.request('terminal.info', { terminalId })).info;
  }

  async getSnapshot(terminalId: TerminalId): Promise<TerminalSnapshot | null> {
    return (await this.request('terminal.snapshot', { terminalId })).snapshot;
  }

  writeInput(terminalId: TerminalId, data: string): boolean {
    if (!data) return true;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'input', terminalId, data });
      return true;
    }
    const current = this.pendingInput.get(terminalId) ?? [];
    const currentBytes = this.pendingInputBytes.get(terminalId) ?? 0;
    if (currentBytes + data.length > 64 * 1024) return false;
    current.push(data);
    this.pendingInput.set(terminalId, current);
    this.pendingInputBytes.set(terminalId, currentBytes + data.length);
    return true;
  }

  private flushInput(terminalId: TerminalId): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const queue = this.pendingInput.get(terminalId);
    if (!queue?.length) return;
    this.send({ type: 'input', terminalId, data: queue.join('') });
    this.pendingInput.delete(terminalId);
    this.pendingInputBytes.delete(terminalId);
  }

  async writeAccepted(terminalId: TerminalId, data: string): Promise<boolean> {
    return (await this.request('terminal.writeAccepted', { terminalId, data })).accepted;
  }

  async writeToTerminal(terminalId: TerminalId, data: string): Promise<boolean> {
    return (await this.request('terminal.write', { terminalId, data })).success;
  }

  async resizeTerminal(terminalId: TerminalId, cols: number, rows: number): Promise<boolean> {
    return (await this.request('terminal.resize', { terminalId, size: { cols, rows } })).success;
  }

  async closeTerminal(terminalId: TerminalId): Promise<boolean> {
    return (await this.request('terminal.close', { terminalId })).success;
  }

  /** @deprecated Use closeTerminal. */
  killTerminal(terminalId: TerminalId): Promise<boolean> {
    return this.closeTerminal(terminalId);
  }

  async renameTerminal(terminalId: TerminalId, title: string): Promise<TerminalInfo | null> {
    return (await this.request('terminal.rename', { terminalId, title })).info;
  }

  async restartTerminal(terminalId: TerminalId): Promise<TerminalInfo | null> {
    return (await this.request('terminal.restart', { terminalId })).info;
  }

  async signalTerminal(terminalId: TerminalId, signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL'): Promise<boolean> {
    return (await this.request('terminal.signal', { terminalId, signal })).success;
  }

  publishAgentStatus(terminalId: TerminalId, launchToken: string, payload: import('@bohemian/terminal-protocol').ParsedAgentStatus): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.send({ type: 'agent-status', terminalId, launchToken, payload });
    return true;
  }

  ackTerminal(frame: TerminalOutputFrame): boolean {
    this.pendingAcks.push({
      type: 'ack',
      terminalId: frame.terminalId,
      sequence: frame.sequence,
      sourceEnd: frame.sourceEnd,
      connectionGeneration: frame.connectionGeneration,
      deliveryToken: frame.deliveryToken,
      incarnationId: frame.incarnationId,
    });
    if (this.pendingAcks.length >= 64) this.flushAcks();
    else if (this.ackTimer === null) this.ackTimer = setTimeout(() => this.flushAcks(), 4);
    return true;
  }

  private flushAcks(): void {
    if (this.ackTimer) clearTimeout(this.ackTimer);
    this.ackTimer = null;
    if (!this.pendingAcks.length || !this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const acknowledgements = this.pendingAcks.splice(0, this.pendingAcks.length).map(({ type: _type, ...ack }) => ack);
    this.send({ type: 'ack-batch', acknowledgements });
  }

  private ensureOutputSubscription(terminalId: TerminalId): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.subscribedOutputs.has(terminalId)) return;
    const registrations = this.outputCallbacks.get(terminalId);
    if (!registrations || ![...registrations.values()].some((registration) => registration.active)) return;
    this.send({
      type: 'subscribe',
      id: this.outputSubscriptionId(terminalId),
      channel: 'terminal.output',
      owner: true,
      filter: { terminalId },
    });
    this.subscribedOutputs.add(terminalId);
    this.flushInput(terminalId);
  }

  private removeOutputSubscription(terminalId: TerminalId): void {
    if (!this.subscribedOutputs.delete(terminalId)) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ type: 'unsubscribe', id: this.outputSubscriptionId(terminalId) });
    }
  }

  private syncOutputSubscription(terminalId: TerminalId): void {
    const registrations = this.outputCallbacks.get(terminalId);
    if (registrations && [...registrations.values()].some((registration) => registration.active)) {
      this.ensureOutputSubscription(terminalId);
    } else {
      this.removeOutputSubscription(terminalId);
    }
  }

  async clearBuffer(terminalId: TerminalId): Promise<boolean> {
    return (await this.request('terminal.clearBuffer', { terminalId })).success;
  }

  async terminalHistory(terminalId?: TerminalId, limit = 50): Promise<TerminalHistoryEntry[]> {
    return (await this.request('terminal.history', { terminalId, limit })).entries;
  }

  async searchTerminals(query: string, limit = 30): Promise<TerminalSearchMatch[]> {
    return (await this.request('terminal.search', { query, limit })).matches;
  }

  subscribeToOutput(terminalId: TerminalId, callback: OutputCallback): TerminalOutputSubscription {
    let registrations = this.outputCallbacks.get(terminalId);
    if (!registrations) {
      registrations = new Map();
      this.outputCallbacks.set(terminalId, registrations);
    }
    const attachmentId = Symbol(terminalId);
    const registration: OutputRegistration = { callback, active: true };
    registrations.set(attachmentId, registration);
    this.syncOutputSubscription(terminalId);
    let subscribed = true;
    return {
      setActive: (active) => {
        if (!subscribed || registration.active === active) return false;
        registration.active = active;
        this.syncOutputSubscription(terminalId);
        return true;
      },
      unsubscribe: () => {
        if (!subscribed) return;
        subscribed = false;
        const current = this.outputCallbacks.get(terminalId);
        current?.delete(attachmentId);
        if (current?.size === 0) this.outputCallbacks.delete(terminalId);
        this.syncOutputSubscription(terminalId);
      },
    };
  }

  subscribeToExit(terminalId: TerminalId, callback: ExitCallback): () => void {
    let callbacks = this.exitCallbacks.get(terminalId);
    if (!callbacks) {
      callbacks = new Set();
      this.exitCallbacks.set(terminalId, callbacks);
    }
    callbacks.add(callback);
    return () => {
      callbacks?.delete(callback);
      if (callbacks?.size === 0) this.exitCallbacks.delete(terminalId);
    };
  }

  subscribeToEvents(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  subscribeToConnection(callback: ConnectionCallback): () => void {
    this.connectionCallbacks.add(callback);
    callback(this.connectionState);
    return () => this.connectionCallbacks.delete(callback);
  }

  getConnectionState(): TerminalConnectionState {
    return this.connectionState;
  }

  isConnected(): boolean {
    return this.connectionState === 'connected';
  }

  private setConnectionState(state: TerminalConnectionState): void {
    if (this.connectionState === state) return;
    this.connectionState = state;
    this.connectionCallbacks.forEach((callback) => callback(state));
  }

  private outputSubscriptionId(terminalId: string): string {
    return `terminal-output:${terminalId}`;
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pendingRequests.values()) {
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
    this.pendingRequests.clear();
  }
}
