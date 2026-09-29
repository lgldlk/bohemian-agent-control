import type { TerminalRenderControllerStats } from './terminalRenderController';

export type TerminalPerformancePresentation = 'cold' | 'warm' | 'hot';

export interface TerminalPerformanceTerminal {
  terminalId: string;
  presentation: TerminalPerformancePresentation;
  active: boolean;
  webgl: boolean;
  queuedFrames: number;
  queuedBytes: number;
  inFlightFrames: number;
  droppedFrames: number;
  bytesWritten: number;
  lastParseMs: number;
}

export interface TerminalPerformanceSnapshot {
  timestamp: number;
  fps: number;
  frameTimeMs: number;
  longFrames: number;
  terminals: readonly TerminalPerformanceTerminal[];
  hotTerminals: number;
  warmTerminals: number;
  coldTerminals: number;
  webglTerminals: number;
  queuedFrames: number;
  queuedBytes: number;
  inFlightFrames: number;
  droppedFrames: number;
  bytesWritten: number;
  lastParseMs: number;
}

export interface TerminalPerformanceHistoryPoint {
  timestamp: number;
  fps: number;
  frameTimeMs: number;
  queuedBytes: number;
}

type Source = {
  getSnapshot: () => TerminalPerformanceTerminal;
};

const sources = new Map<string, Source>();
const listeners = new Set<() => void>();
const history: TerminalPerformanceHistoryPoint[] = [];
const HISTORY_SIZE = 36;
let snapshot: TerminalPerformanceSnapshot = emptySnapshot(0);
let frameHandle: number | null = null;
let windowStartedAt = 0;
let frameCount = 0;
let frameTimeTotal = 0;
let longFrames = 0;
let previousFrameAt = 0;

function emptySnapshot(timestamp: number): TerminalPerformanceSnapshot {
  return {
    timestamp,
    fps: 0,
    frameTimeMs: 0,
    longFrames: 0,
    terminals: [],
    hotTerminals: 0,
    warmTerminals: 0,
    coldTerminals: 0,
    webglTerminals: 0,
    queuedFrames: 0,
    queuedBytes: 0,
    inFlightFrames: 0,
    droppedFrames: 0,
    bytesWritten: 0,
    lastParseMs: 0,
  };
}

function collectSnapshot(timestamp: number, fps: number, frameTimeMs: number, measuredLongFrames: number): TerminalPerformanceSnapshot {
  const terminals = [...sources.entries()].map(([terminalId, source]) => {
    try {
      const value = source.getSnapshot();
      return value.terminalId === terminalId ? value : { ...value, terminalId };
    } catch {
      return {
        terminalId,
        presentation: 'cold' as const,
        active: false,
        webgl: false,
        queuedFrames: 0,
        queuedBytes: 0,
        inFlightFrames: 0,
        droppedFrames: 0,
        bytesWritten: 0,
        lastParseMs: 0,
      };
    }
  });
  return {
    timestamp,
    fps,
    frameTimeMs,
    longFrames: measuredLongFrames,
    terminals,
    hotTerminals: terminals.filter((item) => item.presentation === 'hot').length,
    warmTerminals: terminals.filter((item) => item.presentation === 'warm').length,
    coldTerminals: terminals.filter((item) => item.presentation === 'cold').length,
    webglTerminals: terminals.filter((item) => item.webgl).length,
    queuedFrames: terminals.reduce((sum, item) => sum + item.queuedFrames, 0),
    queuedBytes: terminals.reduce((sum, item) => sum + item.queuedBytes, 0),
    inFlightFrames: terminals.reduce((sum, item) => sum + item.inFlightFrames, 0),
    droppedFrames: terminals.reduce((sum, item) => sum + item.droppedFrames, 0),
    bytesWritten: terminals.reduce((sum, item) => sum + item.bytesWritten, 0),
    lastParseMs: terminals.reduce((max, item) => Math.max(max, item.lastParseMs), 0),
  };
}

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function stopSampler(): void {
  if (frameHandle !== null) cancelAnimationFrame(frameHandle);
  frameHandle = null;
  windowStartedAt = 0;
  frameCount = 0;
  frameTimeTotal = 0;
  longFrames = 0;
  previousFrameAt = 0;
}

function sampleFrame(timestamp: number): void {
  if (previousFrameAt > 0) {
    const frameTime = timestamp - previousFrameAt;
    frameTimeTotal += frameTime;
    frameCount += 1;
    if (frameTime > 32) longFrames += 1;
  }
  previousFrameAt = timestamp;
  if (windowStartedAt === 0) windowStartedAt = timestamp;
  if (timestamp - windowStartedAt >= 500) {
    const elapsed = timestamp - windowStartedAt;
    snapshot = collectSnapshot(
      timestamp,
      frameCount * 1000 / elapsed,
      frameCount ? frameTimeTotal / frameCount : 0,
      longFrames,
    );
    history.push({
      timestamp,
      fps: snapshot.fps,
      frameTimeMs: snapshot.frameTimeMs,
      queuedBytes: snapshot.queuedBytes,
    });
    if (history.length > HISTORY_SIZE) history.splice(0, history.length - HISTORY_SIZE);
    notify();
    windowStartedAt = timestamp;
    frameCount = 0;
    frameTimeTotal = 0;
    longFrames = 0;
  }
  if (listeners.size > 0) frameHandle = requestAnimationFrame(sampleFrame);
  else stopSampler();
}

function startSampler(): void {
  if (frameHandle !== null || typeof requestAnimationFrame !== 'function') return;
  frameHandle = requestAnimationFrame(sampleFrame);
}

export function registerTerminalPerformanceSource(
  terminalId: string,
  getSnapshot: () => TerminalPerformanceTerminal,
): () => void {
  sources.set(terminalId, { getSnapshot });
  return () => {
    const source = sources.get(terminalId);
    if (source?.getSnapshot === getSnapshot) sources.delete(terminalId);
  };
}

export function subscribeTerminalPerformance(listener: () => void): () => void {
  listeners.add(listener);
  startSampler();
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopSampler();
  };
}

export function getTerminalPerformanceSnapshot(): TerminalPerformanceSnapshot {
  return snapshot;
}

export function getTerminalPerformanceHistory(): readonly TerminalPerformanceHistoryPoint[] {
  return history;
}

export function resetTerminalPerformanceForTests(): void {
  sources.clear();
  listeners.clear();
  stopSampler();
  history.length = 0;
  snapshot = emptySnapshot(0);
}

export function terminalPerformanceSnapshotFromStats(
  stats: TerminalRenderControllerStats,
  input: Pick<TerminalPerformanceTerminal, 'terminalId' | 'presentation' | 'active' | 'webgl'>,
): TerminalPerformanceTerminal {
  return { ...input, ...stats };
}
