import type { BoardPluginEvent } from './events';
import { BoardPluginRuntimeCore } from './runtimeCore';

const rootRuntime = new BoardPluginRuntimeCore();
const mountedRuntimes = new Set<BoardPluginRuntimeCore>();
const listeners = new Set<() => void>();
let activeRuntime = rootRuntime;
let revision = 0;

function notifyActiveRuntimeChanged(): void {
  revision += 1;
  for (const listener of [...listeners]) listener();
}

export function getRootBoardPluginRuntime(): BoardPluginRuntimeCore {
  return rootRuntime;
}

export function getActiveBoardPluginRuntime(): BoardPluginRuntimeCore {
  return activeRuntime;
}

export function subscribeActiveBoardPluginRuntime(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveBoardPluginRuntimeRevision(): number {
  return revision;
}

export function activateBoardPluginRuntime(runtime: BoardPluginRuntimeCore): void {
  mountedRuntimes.add(runtime);
  activeRuntime = runtime;
  notifyActiveRuntimeChanged();
}

export function deactivateBoardPluginRuntime(runtime: BoardPluginRuntimeCore): void {
  mountedRuntimes.delete(runtime);
  if (activeRuntime === runtime) activeRuntime = rootRuntime;
  notifyActiveRuntimeChanged();
}

export function emitToMountedBoardPluginRuntimes(event: BoardPluginEvent): void {
  const targets = mountedRuntimes.size > 0 ? [...mountedRuntimes] : [rootRuntime];
  for (const runtime of targets) runtime.emit(event);
}
