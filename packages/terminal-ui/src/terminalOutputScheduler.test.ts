import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTerminalOutputScheduler } from './terminalOutputScheduler';

type Frame = () => void;

const frames: Frame[] = [];

function installFrameQueue(): void {
  vi.stubGlobal('requestAnimationFrame', (callback: Frame) => {
    frames.push(callback);
    return frames.length;
  });
}

function flushFrame(): void {
  frames.shift()?.();
}

afterEach(() => {
  frames.length = 0;
  vi.unstubAllGlobals();
});

describe('terminal output scheduler', () => {
  it('coalesces repeated schedules for one pane', () => {
    installFrameQueue();
    const scheduler = getTerminalOutputScheduler({});
    const drain = vi.fn(() => false);
    scheduler.register('terminal-1', {
      drain,
      hasPending: () => false,
      isActive: () => true,
    });

    scheduler.schedule('terminal-1');
    scheduler.schedule('terminal-1');
    expect(frames).toHaveLength(1);

    flushFrame();
    expect(drain).toHaveBeenCalledOnce();
  });

  it('drains active panes before inactive panes', () => {
    installFrameQueue();
    const scheduler = getTerminalOutputScheduler({});
    const order: string[] = [];
    scheduler.register('inactive', {
      drain: () => {
        order.push('inactive');
        return false;
      },
      hasPending: () => false,
      isActive: () => false,
    });
    scheduler.register('active', {
      drain: () => {
        order.push('active');
        return false;
      },
      hasPending: () => false,
      isActive: () => true,
    });

    scheduler.schedule('inactive');
    flushFrame();

    expect(order).toEqual(['active', 'inactive']);
  });

  it('re-schedules a pane that remains pending after the drain budget', () => {
    installFrameQueue();
    const scheduler = getTerminalOutputScheduler({});
    let pending = true;
    const drain = vi.fn(() => {
      pending = false;
      return true;
    });
    scheduler.register('terminal-1', {
      drain,
      hasPending: () => pending,
      isActive: () => true,
    });

    scheduler.schedule('terminal-1');
    flushFrame();

    expect(drain).toHaveBeenCalledOnce();
    expect(frames).toHaveLength(1);
  });
});
