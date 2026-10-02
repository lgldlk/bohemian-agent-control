import { afterEach, describe, expect, it, vi } from 'vitest';
import { TerminalClient } from './TerminalClient';

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 3;
  static instances: FakeWebSocket[] = [];

  readyState = FakeWebSocket.CONNECTING;
  binaryType = '';
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(readonly url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(data);
  }

  open() {
    this.readyState = FakeWebSocket.OPEN;
    this.onopen?.();
  }

  message(value: unknown) {
    this.onmessage?.({ data: JSON.stringify(value) });
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('TerminalClient output attachments', () => {
  afterEach(() => {
    FakeWebSocket.instances = [];
    vi.unstubAllGlobals();
  });

  it('detaches and reattaches a view without changing PTY state', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new TerminalClient({ url: 'ws://terminal.test' });
    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.sent.length = 0;

    const onOutput = vi.fn();
    const attachment = client.subscribeToOutput('terminal-1', onOutput);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      type: 'subscribe',
      channel: 'terminal.output',
      owner: true,
      filter: { terminalId: 'terminal-1' },
    });

    attachment.setActive(false);
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: 'unsubscribe',
      id: 'terminal-output:terminal-1',
    });

    attachment.setActive(true);
    expect(JSON.parse(socket.sent.at(-1)!)).toMatchObject({
      type: 'subscribe',
      channel: 'terminal.output',
      filter: { terminalId: 'terminal-1' },
    });

    attachment.unsubscribe();
    expect(JSON.parse(socket.sent.at(-1)!)).toEqual({
      type: 'unsubscribe',
      id: 'terminal-output:terminal-1',
    });
    client.disconnect();
  });

  it('keeps the shared stream attached while any view remains active', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new TerminalClient({ url: 'ws://terminal.test' });
    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();
    socket.sent.length = 0;

    const visible = vi.fn();
    const hidden = vi.fn();
    const visibleAttachment = client.subscribeToOutput('terminal-shared', visible);
    const hiddenAttachment = client.subscribeToOutput('terminal-shared', hidden);
    const outputFrame = {
      terminalId: 'terminal-shared',
      data: 'visible output',
      sequence: 1,
      bytes: 14,
      sourceStart: 0,
      sourceEnd: 14,
      connectionGeneration: 'generation',
      deliveryToken: 'delivery',
      incarnationId: 'incarnation',
      foreground: true,
    };
    const subscribeCount = () => socket.sent.filter((raw) => {
      const message = JSON.parse(raw);
      return message.type === 'subscribe' && message.channel === 'terminal.output';
    }).length;
    const unsubscribeCount = () => socket.sent.filter((raw) => JSON.parse(raw).type === 'unsubscribe').length;
    expect(subscribeCount()).toBe(1);

    hiddenAttachment.setActive(false);
    socket.message({ type: 'event', event: { type: 'output', frame: outputFrame } });
    expect(visible).toHaveBeenCalledWith(outputFrame);
    expect(hidden).not.toHaveBeenCalled();
    expect(unsubscribeCount()).toBe(0);
    visibleAttachment.setActive(false);
    expect(unsubscribeCount()).toBe(1);
    visibleAttachment.setActive(true);
    expect(subscribeCount()).toBe(2);

    visibleAttachment.unsubscribe();
    hiddenAttachment.unsubscribe();
    client.disconnect();
  });

  it('restores active output attachments before announcing reconnection', () => {
    vi.stubGlobal('WebSocket', FakeWebSocket);
    const client = new TerminalClient({ url: 'ws://terminal.test' });
    const onOutput = vi.fn();
    client.subscribeToOutput('terminal-2', onOutput);
    const order: string[] = [];
    client.subscribeToConnection((state) => {
      if (state === 'connected') order.push('connected');
    });

    client.connect();
    const socket = FakeWebSocket.instances[0];
    socket.open();

    const outputSubscribeIndex = socket.sent.findIndex((raw) => {
      const message = JSON.parse(raw);
      return message.type === 'subscribe' && message.channel === 'terminal.output';
    });
    expect(outputSubscribeIndex).toBeGreaterThanOrEqual(0);
    expect(order).toEqual(['connected']);
    expect(socket.sent.map((raw) => JSON.parse(raw).type)).toEqual(['subscribe', 'subscribe']);
    client.disconnect();
  });
});
