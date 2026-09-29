import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TerminalOutputFrame } from '@bohemian/terminal-protocol';
import { getTerminalOutputScheduler } from './terminalOutputScheduler';
import { TerminalRenderController } from './terminalRenderController';

const frames: Array<FrameRequestCallback> = [];

function installFrameQueue(): void {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.push(callback);
    return frames.length;
  });
}

function frame(sequence: number, data: string): TerminalOutputFrame {
  return {
    terminalId: 'terminal-1',
    data,
    sequence,
    bytes: data.length,
    sourceStart: sequence,
    sourceEnd: sequence + data.length,
    connectionGeneration: 'generation-1',
    deliveryToken: `token-${sequence}`,
    incarnationId: 'incarnation-1',
    foreground: true,
  };
}

afterEach(() => {
  frames.length = 0;
  vi.unstubAllGlobals();
});

describe('terminal render controller', () => {
  it('holds ACKs until xterm accepts the batch', () => {
    installFrameQueue();
    const ackTerminal = vi.fn();
    const writes: string[] = [];
    const scheduler = getTerminalOutputScheduler({});
    const controller = new TerminalRenderController({
      terminalId: 'terminal-1',
      client: { ackTerminal },
      isActive: () => true,
      isSuspended: () => false,
      writeBatch: (_batch, body, complete) => {
        writes.push(body);
        expect(ackTerminal).not.toHaveBeenCalled();
        complete();
      },
    });
    controller.attach(scheduler);
    controller.enqueue(frame(1, 'hello'));
    expect(frames).toHaveLength(1);

    frames.shift()?.(0);

    expect(writes).toEqual(['hello']);
    expect(ackTerminal).toHaveBeenCalledWith(frame(1, 'hello'));
    controller.dispose();
  });

  it('ACKs queued output when a terminal becomes suspended', () => {
    installFrameQueue();
    const ackTerminal = vi.fn();
    const scheduler = getTerminalOutputScheduler({});
    let suspended = false;
    const controller = new TerminalRenderController({
      terminalId: 'terminal-1',
      client: { ackTerminal },
      isActive: () => true,
      isSuspended: () => suspended,
      writeBatch: vi.fn(),
    });
    controller.attach(scheduler);
    controller.enqueue(frame(1, 'queued'));
    suspended = true;
    controller.setSuspended(true);

    expect(ackTerminal).toHaveBeenCalledWith(frame(1, 'queued'));
    expect(frames).toHaveLength(1);
    controller.dispose();
  });

  it('throttles warm output after the first visible batch', () => {
    installFrameQueue();
    const scheduler = getTerminalOutputScheduler({});
    const writes: string[] = [];
    const controller = new TerminalRenderController({
      terminalId: 'terminal-1',
      client: { ackTerminal: vi.fn() },
      isActive: () => false,
      isSuspended: () => false,
      warmIntervalMs: 60_000,
      writeBatch: (_batch, body, complete) => {
        writes.push(body);
        complete();
      },
    });
    controller.attach(scheduler);
    controller.enqueue(frame(1, 'first'));
    frames.shift()?.(0);
    controller.enqueue(frame(2, 'second'));

    expect(writes).toEqual(['first']);
    expect(frames).toHaveLength(0);
    controller.dispose();
  });
  it('marks the first frame after a backlog drop for snapshot recovery', () => {
    const ackTerminal = vi.fn();
    const writes: string[] = [];
    const controller = new TerminalRenderController({
      terminalId: 'terminal-1',
      client: { ackTerminal },
      isActive: () => true,
      isSuspended: () => false,
      writeBatch: (batch, _body, complete) => {
        writes.push(batch.map((item) => `${item.droppedOutput ? 'dropped:' : ''}${item.data}`).join('|'));
        complete();
      },
    });
    for (let index = 0; index < 2 * 1024 * 1024 / 1024 + 2; index += 1) {
      controller.enqueue(frame(index + 1, 'x'.repeat(1024)));
    }

    const scheduler = getTerminalOutputScheduler({});
    installFrameQueue();
    controller.attach(scheduler);
    frames.shift()?.(0);

    expect(ackTerminal).toHaveBeenCalled();
    expect(controller.getStats().droppedFrames).toBeGreaterThan(0);
    controller.dispose();
  });
});
