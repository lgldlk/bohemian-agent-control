import type { TerminalClient } from '@bohemian/terminal-client';
import type { TerminalOutputFrame } from '@bohemian/terminal-protocol';
import type { TerminalOutputScheduler } from './terminalOutputScheduler';

export const TERMINAL_OUTPUT_BACKLOG_MAX_CHARS = 2 * 1024 * 1024;

export interface TerminalRenderControllerOptions {
  terminalId: string;
  client: Pick<TerminalClient, 'ackTerminal'>;
  isActive: () => boolean;
  isSuspended: () => boolean;
  writeBatch: (
    frames: readonly TerminalOutputFrame[],
    body: string,
    complete: () => void,
  ) => void;
  warmIntervalMs?: number;
}

export interface TerminalRenderControllerStats {
  queuedFrames: number;
  queuedBytes: number;
  inFlightFrames: number;
  batches: number;
  bytesWritten: number;
  droppedFrames: number;
  lastParseMs: number;
}

/** Owns output ordering, render budgeting and ACK release for one terminal. */
export class TerminalRenderController {
  private readonly queue: TerminalOutputFrame[] = [];
  private queueChars = 0;
  private backlogWarningPending = false;
  private busy = false;
  private disposed = false;
  private unregister: (() => void) | null = null;
  private scheduleFrame: (() => void) | null = null;
  private warmTimer: ReturnType<typeof setTimeout> | null = null;
  private nextWarmAt = 0;
  private readonly warmIntervalMs: number;
  private readonly hotBatchChars: number;
  private readonly warmBatchChars: number;
  private readonly stats: TerminalRenderControllerStats = {
    queuedFrames: 0,
    queuedBytes: 0,
    inFlightFrames: 0,
    batches: 0,
    bytesWritten: 0,
    droppedFrames: 0,
    lastParseMs: 0,
  };

  constructor(private readonly options: TerminalRenderControllerOptions) {
    this.warmIntervalMs = Math.max(16, options.warmIntervalMs ?? 100);
    this.hotBatchChars = 16 * 1024;
    this.warmBatchChars = 32 * 1024;
  }

  attach(scheduler: TerminalOutputScheduler): void {
    this.unregister?.();
    this.unregister = scheduler.register(this.options.terminalId, {
      drain: (deadline) => this.drain(deadline),
      hasPending: () => !this.disposed && !this.busy && this.queue.length > 0 && !this.options.isSuspended() && this.isEligible(),
      isActive: () => this.options.isActive(),
    });
    this.scheduleFrame = () => scheduler.schedule(this.options.terminalId);
    if (this.queue.length > 0 && !this.options.isSuspended()) this.schedule();
  }

  enqueue(frame: TerminalOutputFrame): void {
    if (this.disposed) {
      this.options.client.ackTerminal(frame);
      return;
    }
    const next = this.backlogWarningPending ? { ...frame, droppedOutput: true } : frame;
    this.backlogWarningPending = false;
    this.queue.push(next);
    this.queueChars += next.data.length;
    while (this.queueChars > TERMINAL_OUTPUT_BACKLOG_MAX_CHARS && this.queue.length > 1) {
      const dropped = this.queue.shift();
      if (!dropped) break;
      this.queueChars -= dropped.data.length;
      this.stats.droppedFrames += 1;
      this.options.client.ackTerminal(dropped);
      this.backlogWarningPending = true;
    }
    this.stats.queuedFrames = this.queue.length;
    this.stats.queuedBytes = this.queueChars;
    if (!this.options.isSuspended()) this.schedule();
  }

  getStats(): TerminalRenderControllerStats {
    return { ...this.stats };
  }

  setSuspended(suspended: boolean): void {
    if (suspended) {
      if (this.warmTimer !== null) clearTimeout(this.warmTimer);
      this.warmTimer = null;
      this.ackQueuedFrames();
      return;
    }
    if (this.queue.length > 0) this.schedule();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.unregister?.();
    this.unregister = null;
    if (this.warmTimer !== null) clearTimeout(this.warmTimer);
    this.warmTimer = null;
    this.scheduleFrame = null;
    this.ackQueuedFrames();
  }

  schedule(): void {
    if (this.disposed || this.options.isSuspended() || this.queue.length === 0) return;
    if (!this.isEligible()) {
      if (this.warmTimer === null) {
        this.warmTimer = setTimeout(() => {
          this.warmTimer = null;
          this.schedule();
        }, Math.max(0, this.nextWarmAt - performance.now()));
      }
      return;
    }
    if (this.warmTimer !== null) clearTimeout(this.warmTimer);
    this.warmTimer = null;
    this.scheduleFrame?.();
  }

  private drain(deadline: number): boolean {
    if (this.disposed || this.busy || this.options.isSuspended() || this.queue.length === 0 || !this.isEligible()) return false;
    const batch: TerminalOutputFrame[] = [];
    const maxBatchChars = this.options.isActive() ? this.hotBatchChars : this.warmBatchChars;
    let batchChars = 0;
    while (
      this.queue.length > 0
      && (batch.length === 0 || (performance.now() < deadline && batchChars < maxBatchChars))
    ) {
      const frame = this.queue.shift();
      if (!frame) break;
      this.queueChars -= frame.data.length;
      batchChars += frame.data.length;
      batch.push(frame);
    }
    this.stats.queuedFrames = this.queue.length;
    this.stats.queuedBytes = this.queueChars;
    if (!this.options.isActive()) this.nextWarmAt = performance.now() + this.warmIntervalMs;
    if (batch.length === 0) return false;

    const body = batch.map((frame) => (
      `${frame.droppedOutput ? '\r\n\x1b[33m[terminal output backlog skipped; restore from snapshot if needed]\x1b[0m\r\n' : ''}${frame.data}`
    )).join('');
    this.busy = true;
    this.stats.inFlightFrames = batch.length;
    this.stats.batches += 1;
    this.stats.bytesWritten += batch.reduce((total, frame) => total + frame.data.length, 0);
    const startedAt = performance.now();
    let completed = false;
    const complete = () => {
      if (completed) return;
      completed = true;
      this.stats.lastParseMs = performance.now() - startedAt;
      this.stats.inFlightFrames = 0;
      for (const frame of batch) this.options.client.ackTerminal(frame);
      this.busy = false;
      if (!this.disposed && this.queue.length > 0 && !this.options.isSuspended()) this.schedule();
    };
    try {
      this.options.writeBatch(batch, body, complete);
    } catch {
      complete();
    }
    return this.queue.length > 0 && this.isEligible();
  }

  private isEligible(): boolean {
    return this.options.isActive() || performance.now() >= this.nextWarmAt;
  }

  private ackQueuedFrames(): void {
    for (const frame of this.queue) this.options.client.ackTerminal(frame);
    this.queue.length = 0;
    this.queueChars = 0;
    this.stats.queuedFrames = 0;
    this.stats.queuedBytes = 0;
    this.backlogWarningPending = false;
  }
}
