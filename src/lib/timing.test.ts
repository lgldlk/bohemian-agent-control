import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDebouncedTask, createRafScheduler } from './timing';

describe('createDebouncedTask', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('runs only the latest scheduled task', () => {
    const calls: string[] = [];
    const debounced = createDebouncedTask(10);
    debounced.schedule(() => calls.push('first'));
    debounced.schedule(() => calls.push('second'));

    vi.advanceTimersByTime(9);
    expect(calls).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls).toEqual(['second']);
  });

  it('cancels and flushes pending work', () => {
    const calls: string[] = [];
    const debounced = createDebouncedTask(10);
    debounced.schedule(() => calls.push('cancelled'));
    debounced.cancel();
    vi.advanceTimersByTime(10);
    expect(calls).toEqual([]);

    debounced.schedule(() => calls.push('flushed'));
    debounced.flush();
    expect(calls).toEqual(['flushed']);
  });
});

describe('createRafScheduler', () => {
  afterEach(() => vi.restoreAllMocks());

  it('coalesces work and cancels pending frames', () => {
    let callback: FrameRequestCallback | undefined;
    const requestAnimationFrame = vi.fn((next: FrameRequestCallback) => {
      callback = next;
      return 1;
    });
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame);
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame);
    const calls: number[] = [];
    const scheduler = createRafScheduler(() => calls.push(1));

    scheduler.schedule();
    scheduler.schedule();
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);
    expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
    callback?.(0);
    expect(calls).toEqual([1]);

    scheduler.schedule();
    scheduler.cancel();
    expect(cancelAnimationFrame).toHaveBeenCalledTimes(2);
  });
});
