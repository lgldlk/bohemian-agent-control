import type { Editor } from 'tldraw';
import type { Task } from '@/types';
import {
  activateBoardPluginRuntime,
  deactivateBoardPluginRuntime,
  emitToMountedBoardPluginRuntimes,
  getActiveBoardPluginRuntime,
  getActiveBoardPluginRuntimeRevision,
  getRootBoardPluginRuntime,
  subscribeActiveBoardPluginRuntime,
} from './activeRuntimeRegistry';
import { createBoardPluginContext } from './contextFactory';
import { attachBoardPluginEditorEvents } from './editorEventBridge';
import type { BoardPluginEvent } from './events';
import { listBoardPlugins, subscribeBoardPluginRegistry } from './registry';
import { BoardPluginRuntimeCore } from './runtimeCore';
import type { BoardPluginContext } from './types';

const rootRuntime = getRootBoardPluginRuntime();

export {
  getActiveBoardPluginRuntimeRevision,
  subscribeActiveBoardPluginRuntime,
};

/** Returns the runtime currently associated with the visible board. */
export function getDefaultBoardPluginRuntime(): BoardPluginRuntimeCore {
  return getActiveBoardPluginRuntime();
}

/** Legacy root-runtime bridge used by non-scoped callers. */
export function subscribeBoardPluginUi(listener: () => void): () => void {
  return rootRuntime.subscribeUi(listener);
}

export function getBoardPluginUiRevision(): number {
  return rootRuntime.getUiRevision();
}

export function getBoardPluginContext(pluginId: string): BoardPluginContext | undefined {
  return rootRuntime.getContext(pluginId);
}

export function executeBoardPluginCommand(pluginId: string, commandId: string): void | Promise<void> {
  return rootRuntime.executeCommand(pluginId, commandId);
}

export function emitBoardPluginEvent(event: BoardPluginEvent): void {
  emitToMountedBoardPluginRuntimes(event);
}

export function mountBoardPluginRuntime(
  editor: Editor,
  tasksRef: { current: readonly Task[] },
  runtime: BoardPluginRuntimeCore = rootRuntime,
): () => void {
  const mounted = runtime.mount(
    listBoardPlugins(),
    (plugin, events) => createBoardPluginContext(plugin, editor, tasksRef, events),
  );
  activateBoardPluginRuntime(runtime);

  let unsubscribeRegistry: (() => void) | undefined;
  let detachEditorEvents: (() => void) | undefined;
  try {
    unsubscribeRegistry = subscribeBoardPluginRegistry((event) => {
      if (event.type === 'unregistered') runtime.cleanupPlugin(event.pluginId);
    });
    detachEditorEvents = attachBoardPluginEditorEvents(editor, mounted.events);
  } catch (error) {
    unsubscribeRegistry?.();
    mounted.stop();
    deactivateBoardPluginRuntime(runtime);
    throw error;
  }

  return () => {
    detachEditorEvents?.();
    unsubscribeRegistry?.();
    mounted.stop();
    deactivateBoardPluginRuntime(runtime);
  };
}

export { BoardPluginRuntimeCore };
