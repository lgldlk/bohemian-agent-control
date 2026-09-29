import { useSyncExternalStore } from 'react';
import type {
  BoardPluginContext,
  BoardPluginToolbarContribution,
  BoardPluginTopbarContribution,
} from '../types';
import { useBoardPluginRuntime } from '../runtimeScope';

type ActionContribution = BoardPluginToolbarContribution | BoardPluginTopbarContribution;

export function safePluginValue<T>(
  pluginId: string,
  name: string,
  fallback: T,
  read: () => T,
): T {
  try {
    return read();
  } catch (error) {
    console.error(`[board-plugin:${pluginId}] ${name} failed`, error);
    return fallback;
  }
}

export function invokePluginAction(
  pluginId: string,
  item: ActionContribution,
  context: BoardPluginContext | undefined,
): void {
  if (!context || !item.onClick) return;
  try {
    void Promise.resolve(item.onClick(context)).catch((error: unknown) => {
      context.notify.error('Plugin action failed');
      console.error(`[board-plugin:${pluginId}] action ${item.id} failed`, error);
    });
  } catch (error) {
    context.notify.error('Plugin action failed');
    console.error(`[board-plugin:${pluginId}] action ${item.id} failed`, error);
  }
}

/** Hosts outside the Tldraw tree subscribe to runtime-owned UI state here. */
export function usePluginRuntimeUi() {
  const runtime = useBoardPluginRuntime();
  useSyncExternalStore(
    (listener) => runtime.subscribeUi(listener),
    () => runtime.getUiRevision(),
  );
  return runtime;
}
