export interface DebouncedTask {
  schedule(task: () => void): void;
  cancel(): void;
  flush(): void;
}

export function createDebouncedTask(delayMs: number): DebouncedTask {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: (() => void) | null = null;

  const cancel = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    pending = null;
  };

  const flush = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
    const task = pending;
    pending = null;
    task?.();
  };

  return {
    schedule(task) {
      if (timer !== null) clearTimeout(timer);
      pending = task;
      timer = setTimeout(flush, delayMs);
    },
    cancel,
    flush,
  };
}

export interface RafScheduler {
  schedule(): void;
  cancel(): void;
}

export function createRafScheduler(task: () => void): RafScheduler {
  let frame: number | null = null;

  return {
    schedule() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        task();
      });
    },
    cancel() {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    },
  };
}
