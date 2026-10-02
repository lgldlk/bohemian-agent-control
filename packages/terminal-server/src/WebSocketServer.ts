import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer as WSServer } from 'ws';
import type {
  RPCMethod,
  TerminalId,
  TerminalRPCMethods,
  WSMessage,
  WSEventMessage,
  WSResponseMessage,
} from '@bohemian/terminal-protocol';
import { encodeTerminalOutputFrame } from '@bohemian/terminal-protocol';
import {
  authorizeConnection,
  DEFAULT_ALLOWED_ORIGINS,
  headerValue,
  tokenFromUrl,
} from './localAuth';
import { PTYManager } from './PTYManager';

type OutputStream = {
  terminalId: TerminalId;
  deliveryToken: string;
  incarnationId: string;
  queue: Array<{ data: string; sequence: number; bytes: number; sourceStart: number; sourceEnd: number; droppedOutput: boolean }>;
  queuedBytes: number;
  inFlightBytes: number;
  sent: Array<{ sequence: number; sourceEnd: number; bytes: number }>;
  sentEnd: number;
  creditedEnd: number;
};

type ClientState = {
  subscriptions: Map<string, () => void>;
  streamSubscriptionIds: Map<TerminalId, string>;
  streams: Map<string, OutputStream>;
  generation: string;
};

const STREAM_WINDOW_BYTES = 512 * 1024;
const CONNECTION_WINDOW_BYTES = 2 * 1024 * 1024;
const STREAM_PENDING_BYTES = 256 * 1024;
export interface TerminalWebSocketServerOptions {
  port: number;
  host?: string;
  ptyManager: PTYManager;
  token: string;
  allowedOrigins?: readonly string[];
}

/** Transport adapter: maps the shared protocol to PTYManager operations. */
export class TerminalWebSocketServer {
  private readonly wss: WSServer;
  private readonly ptyManager: PTYManager;
  private readonly clients = new Map<WebSocket, ClientState>();
  private readonly owners = new Map<TerminalId, WebSocket>();

  constructor(options: TerminalWebSocketServerOptions) {
    this.ptyManager = options.ptyManager;
    const allowedOrigins = options.allowedOrigins ?? DEFAULT_ALLOWED_ORIGINS;
    this.wss = new WSServer({
      port: options.port,
      host: options.host ?? '127.0.0.1',
      verifyClient: (info, done) => {
        const verdict = authorizeConnection({
          token: tokenFromUrl(info.req.url) ?? headerValue(info.req.headers['x-bohemian-token']),
          expectedToken: options.token,
          origin: info.origin || headerValue(info.req.headers.origin),
          allowedOrigins,
        });
        done(verdict.ok, verdict.ok ? 200 : verdict.status, verdict.ok ? 'ok' : verdict.reason);
      },
    });
    this.wss.on('connection', (ws, req) => this.handleConnection(ws, req));
    this.wss.on('error', (error) => console.error('[WS] Server error:', error));
    const host = options.host ?? '127.0.0.1';
    this.wss.on('listening', () => {
      const address = this.wss.address();
      const port = address && typeof address === 'object' ? address.port : options.port;
      console.log(`[WS] Terminal server listening on ws://${host}:${port}`);
    });
  }

  ready(): Promise<number> {
    const current = this.wss.address();
    if (current && typeof current === 'object') return Promise.resolve(current.port);
    return new Promise((resolve, reject) => {
      this.wss.once('listening', () => {
        const address = this.wss.address();
        resolve(address && typeof address === 'object' ? address.port : 0);
      });
      this.wss.once('error', reject);
    });
  }

  private handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    const state: ClientState = {
      subscriptions: new Map(),
      streamSubscriptionIds: new Map(),
      streams: new Map(),
      generation: crypto.randomUUID(),
    };
    this.clients.set(ws, state);
    const subscriptions = state.subscriptions;

    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString()) as WSMessage;
        if (message.type === 'request') {
          void this.handleRequest(ws, message.id, message.method, message.params as never);
        } else if (message.type === 'input') {
          if (this.owners.get(message.terminalId) === ws) this.ptyManager.write(message.terminalId, message.data);
        } else if (message.type === 'ack') {
          this.handleAck(ws, state, message.terminalId, message.sequence, message.sourceEnd, message.connectionGeneration, message.deliveryToken, message.incarnationId);
        } else if (message.type === 'ack-batch') {
          for (const ack of message.acknowledgements) {
            this.handleAck(ws, state, ack.terminalId, ack.sequence, ack.sourceEnd, ack.connectionGeneration, ack.deliveryToken, ack.incarnationId);
          }
        } else if (message.type === 'agent-status') {
          this.ptyManager.applyAgentStatus(message.terminalId, message.launchToken, message.payload);
        } else if (message.type === 'subscribe') {
          this.handleSubscribe(ws, state, message.id, message.channel, message.filter?.terminalId, Boolean(message.owner));
        } else if (message.type === 'unsubscribe') {
          subscriptions.get(message.id)?.();
          subscriptions.delete(message.id);
          for (const [terminalId, subscriptionId] of state.streamSubscriptionIds) {
            if (subscriptionId === message.id) state.streamSubscriptionIds.delete(terminalId);
          }
        } else if (message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: message.timestamp }));
        }
      } catch (error) {
        console.error('[WS] Invalid message:', error);
        this.sendError(ws, 'unknown', 'Invalid JSON message');
      }
    });

    ws.on('close', () => {
      for (const [terminalId, owner] of this.owners) {
        if (owner === ws) this.owners.delete(terminalId);
      }
      for (const unsubscribe of subscriptions.values()) unsubscribe();
      subscriptions.clear();
      this.clients.delete(ws);
    });
    ws.on('error', (error) => console.error('[WS] Client error:', error));
  }

  private handleSubscribe(
    ws: WebSocket,
    state: ClientState,
    subscriptionId: string,
    channel: 'terminal.output' | 'terminal.events',
    terminalId: TerminalId | undefined,
    owner: boolean,
  ): void {
    state.subscriptions.get(subscriptionId)?.();
    state.subscriptions.delete(subscriptionId);
    if (channel === 'terminal.output' && terminalId) {
      const info = this.ptyManager.getInfo(terminalId);
      if (!info?.incarnationId) return;
      if (owner) {
        const previousOwner = this.owners.get(terminalId);
        if (previousOwner && previousOwner !== ws) {
          // A browser refresh or HMR can leave the old socket alive while the
          // new canvas has already mounted. Transfer only this terminal's
          // stream; other terminals on the old socket remain unaffected.
          const previousState = this.clients.get(previousOwner);
          const previousSubscriptionId = previousState?.streamSubscriptionIds.get(terminalId);
          if (previousState && previousSubscriptionId) {
            previousState.subscriptions.get(previousSubscriptionId)?.();
            previousState.subscriptions.delete(previousSubscriptionId);
            previousState.streamSubscriptionIds.delete(terminalId);
          }
          this.owners.delete(terminalId);
        }
        this.owners.set(terminalId, ws);
      }
      const offset = this.ptyManager.getSnapshot(terminalId)?.sourceEnd ?? 0;
      const stream: OutputStream = {
        terminalId,
        deliveryToken: crypto.randomUUID(),
        incarnationId: info.incarnationId,
        queue: [],
        queuedBytes: 0,
        inFlightBytes: 0,
        sent: [],
        sentEnd: offset,
        creditedEnd: offset,
      };
      state.streams.set(terminalId, stream);
      const unsubscribe = this.ptyManager.subscribe(terminalId, (data, sequence, bytes, droppedOutput, sourceStart, sourceEnd) => {
        stream.queue.push({ data, sequence, bytes, sourceStart, sourceEnd, droppedOutput });
        stream.queuedBytes += bytes;
        while (stream.queuedBytes > STREAM_PENDING_BYTES && stream.queue.length > 1) {
          const dropped = stream.queue.shift()!;
          stream.queuedBytes -= dropped.bytes;
          stream.queue[0].droppedOutput = true;
        }
        this.pumpStream(ws, state, stream);
      });
      state.streamSubscriptionIds.set(terminalId, subscriptionId);
      state.subscriptions.set(subscriptionId, () => {
        unsubscribe();
        if (state.streams.get(terminalId) === stream) state.streams.delete(terminalId);
        if (state.streamSubscriptionIds.get(terminalId) === subscriptionId) {
          state.streamSubscriptionIds.delete(terminalId);
        }
        if (this.owners.get(terminalId) === ws) this.owners.delete(terminalId);
      });
      return;
    }
    if (channel === 'terminal.events') {
      const unsubscribe = this.ptyManager.subscribeEvents((event) => this.send(ws, { type: 'event', event }));
      state.subscriptions.set(subscriptionId, unsubscribe);
    }
  }

  private pumpStream(ws: WebSocket, state: ClientState, stream: OutputStream): void {
    if (ws.readyState !== WebSocket.OPEN || state.streams.get(stream.terminalId) !== stream) return;
    if (this.ptyManager.getInfo(stream.terminalId)?.incarnationId !== stream.incarnationId) {
      stream.queue.length = 0;
      stream.queuedBytes = 0;
      return;
    }
    let totalInFlight = [...state.streams.values()].reduce((sum, item) => sum + item.inFlightBytes, 0);
    while (stream.queue.length > 0 && stream.inFlightBytes < STREAM_WINDOW_BYTES && totalInFlight < CONNECTION_WINDOW_BYTES) {
      const next = stream.queue[0];
      if (stream.inFlightBytes + next.bytes > STREAM_WINDOW_BYTES && stream.inFlightBytes > 0) break;
      if (totalInFlight + next.bytes > CONNECTION_WINDOW_BYTES && totalInFlight > 0) break;
      stream.queue.shift();
      stream.queuedBytes -= next.bytes;
      stream.inFlightBytes += next.bytes;
      totalInFlight += next.bytes;
      stream.sent.push({ sequence: next.sequence, sourceEnd: next.sourceEnd, bytes: next.bytes });
      stream.sentEnd = next.sourceEnd;
      this.sendBinary(ws, encodeTerminalOutputFrame({
        terminalId: stream.terminalId,
        data: next.data,
        sequence: next.sequence,
        bytes: next.bytes,
        sourceStart: next.sourceStart,
        sourceEnd: next.sourceEnd,
        connectionGeneration: state.generation,
        deliveryToken: stream.deliveryToken,
        incarnationId: stream.incarnationId,
        foreground: this.owners.get(stream.terminalId) === ws,
        ...(next.droppedOutput ? { droppedOutput: true } : {}),
      }));
    }
  }

  private handleAck(
    ws: WebSocket,
    state: ClientState,
    terminalId: TerminalId,
    _sequence: number,
    sourceEnd: number,
    connectionGeneration: string,
    deliveryToken: string,
    incarnationId: string,
  ): void {
    const stream = state.streams.get(terminalId);
    if (this.owners.get(terminalId) !== ws || !stream) return;
    if (
      connectionGeneration !== state.generation ||
      deliveryToken !== stream.deliveryToken ||
      incarnationId !== stream.incarnationId ||
      sourceEnd < stream.creditedEnd ||
      sourceEnd > stream.sentEnd
    ) return;
    const sentIndex = stream.sent.findIndex((item) => item.sourceEnd === sourceEnd);
    if (sentIndex < 0 && sourceEnd !== stream.creditedEnd) return;
    let acknowledged = 0;
    if (sentIndex >= 0) {
      for (let index = 0; index <= sentIndex; index += 1) acknowledged += stream.sent[index].bytes;
      stream.sent.splice(0, sentIndex + 1);
    }
    stream.creditedEnd = sourceEnd;
    stream.inFlightBytes = Math.max(0, stream.inFlightBytes - acknowledged);
    for (const candidate of state.streams.values()) this.pumpStream(ws, state, candidate);
  }

  private async handleRequest<M extends RPCMethod>(
    ws: WebSocket,
    id: string,
    method: M,
    params: TerminalRPCMethods[M]['request'],
  ): Promise<void> {
    try {
      let result: unknown;
      switch (method) {
        case 'terminal.create': {
          const terminalId = this.ptyManager.spawn(params as TerminalRPCMethods['terminal.create']['request']);
          result = this.ptyManager.getInfo(terminalId);
          break;
        }
        case 'terminal.writeAccepted': {
          const input = params as TerminalRPCMethods['terminal.writeAccepted']['request'];
          result = { accepted: this.owners.get(input.terminalId) === ws && this.ptyManager.write(input.terminalId, input.data) };
          break;
        }
        case 'terminal.write': {
          const input = params as TerminalRPCMethods['terminal.write']['request'];
          result = { success: this.owners.get(input.terminalId) === ws && this.ptyManager.write(input.terminalId, input.data) };
          break;
        }
        case 'terminal.resize': {
          const input = params as TerminalRPCMethods['terminal.resize']['request'];
          result = { success: this.ptyManager.resize(input.terminalId, input.size.cols, input.size.rows) };
          break;
        }
        case 'terminal.close': {
          const input = params as TerminalRPCMethods['terminal.close']['request'];
          result = { success: await this.ptyManager.close(input.terminalId) };
          break;
        }
        case 'terminal.list':
          result = { terminals: this.ptyManager.list() };
          break;
        case 'terminal.info': {
          const input = params as TerminalRPCMethods['terminal.info']['request'];
          result = { info: this.ptyManager.getInfo(input.terminalId) };
          break;
        }
        case 'terminal.snapshot': {
          const input = params as TerminalRPCMethods['terminal.snapshot']['request'];
          result = { snapshot: this.ptyManager.getSnapshot(input.terminalId) };
          break;
        }
        case 'terminal.rename': {
          const input = params as TerminalRPCMethods['terminal.rename']['request'];
          result = { info: this.ptyManager.rename(input.terminalId, input.title) };
          break;
        }
        case 'terminal.restart': {
          const input = params as TerminalRPCMethods['terminal.restart']['request'];
          result = { info: this.ptyManager.restart(input.terminalId) };
          break;
        }
        case 'terminal.signal': {
          const input = params as TerminalRPCMethods['terminal.signal']['request'];
          result = { success: this.ptyManager.signal(input.terminalId, input.signal) };
          break;
        }
        case 'terminal.clearBuffer': {
          const input = params as TerminalRPCMethods['terminal.clearBuffer']['request'];
          result = { success: this.ptyManager.clearBuffer(input.terminalId) };
          break;
        }
        case 'terminal.ack': {
          const input = params as TerminalRPCMethods['terminal.ack']['request'];
          result = { success: this.ptyManager.ack(input.terminalId, input.sequence) };
          break;
        }
        case 'terminal.history': {
          const input = params as TerminalRPCMethods['terminal.history']['request'];
          result = { entries: this.ptyManager.history(input.terminalId, input.limit) };
          break;
        }
        case 'terminal.search': {
          const input = params as TerminalRPCMethods['terminal.search']['request'];
          result = { matches: this.ptyManager.search(input.query, input.limit) };
          break;
        }
        default:
          throw new Error(`Unsupported terminal method: ${String(method)}`);
      }
      this.send(ws, { type: 'response', id, success: true, result });
    } catch (error) {
      this.sendError(ws, id, error instanceof Error ? error.message : 'Internal error');
    }
  }

  private sendError(ws: WebSocket, id: string, error: string): void {
    this.send(ws, { type: 'response', id, success: false, error });
  }

  private sendBinary(ws: WebSocket, payload: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }

  private send(ws: WebSocket, message: WSResponseMessage | WSEventMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
  }

  close(): void {
    for (const [ws, state] of this.clients) {
      for (const unsubscribe of state.subscriptions.values()) unsubscribe();
      ws.close();
    }
    this.clients.clear();
    this.wss.close();
  }
}
