import type { BoardPlugin, BoardPluginContext } from './types';
import { createBoardPluginEventBus, type BoardPluginEvent, type BoardPluginEventBus } from './events';

export type BoardPluginContextFactory = (
  plugin: BoardPlugin,
  events: BoardPluginEventBus,
) => BoardPluginContext;

type ActivePlugin = {
  runtimeId: symbol;
  plugin: BoardPlugin;
  context: BoardPluginContext;
  cleanup?: () => void;
};

/**
 * Framework-neutral plugin runtime.
 *
 * The board adapter owns editor integration; this class only owns plugin
 * lifecycle, event delivery, command dispatch, and runtime-local contexts.
 */
export class BoardPluginRuntimeCore {
  private readonly activeBuses = new Set<BoardPluginEventBus>();
  private readonly activePlugins = new Map<string, ActivePlugin>();
  private readonly uiListeners = new Set<() => void>();
  private uiRevision = 0;

  subscribeUi(listener: () => void): () => void {
    this.uiListeners.add(listener);
    return () => this.uiListeners.delete(listener);
  }

  getUiRevision(): number {
    return this.uiRevision;
  }

  getContext(pluginId: string): BoardPluginContext | undefined {
    return this.activePlugins.get(pluginId)?.context;
  }

  emit(event: BoardPluginEvent): void {
    for (const bus of this.activeBuses) bus.emit(event);
  }

  executeCommand(pluginId: string, commandId: string): void | Promise<void> {
    const active = this.activePlugins.get(pluginId);
    const command = active?.plugin.commands?.find((item) => item.id === commandId);
    if (!active || !command) return;

    try {
      const result = command.execute(active.context);
      if (result && typeof result.then === 'function') {
        return result.catch((error: unknown) => {
          active.context.notify.error('Plugin command failed');
          console.error(`[board-plugin:${pluginId}] command ${commandId} failed`, error);
        });
      }
      return result;
    } catch (error) {
      active.context.notify.error('Plugin command failed');
      console.error(`[board-plugin:${pluginId}] command ${commandId} failed`, error);
    }
  }

  mount(plugins: readonly BoardPlugin[], createContext: BoardPluginContextFactory): {
    events: BoardPluginEventBus;
    stop: () => void;
  } {
    const runtimeId = Symbol('board-plugin-runtime');
    const events = this.createUiEventBus();
    this.activeBuses.add(events);

    for (const plugin of plugins) {
      const context = createContext(plugin, events);
      const active: ActivePlugin = { runtimeId, plugin, context };
      this.activePlugins.set(plugin.id, active);
      if (!plugin.setup) continue;
      try {
        const cleanup = plugin.setup({ ...context, subscribe: events.subscribe });
        if (cleanup) active.cleanup = cleanup;
      } catch (error) {
        console.error(`[board-plugin:${plugin.id}] setup failed`, error);
      }
    }
    this.bumpUi();

    return {
      events,
      stop: () => {
        for (const plugin of plugins.slice().reverse()) this.cleanupMountedPlugin(plugin.id, runtimeId);
        this.activeBuses.delete(events);
        this.bumpUi();
      },
    };
  }

  cleanupPlugin(pluginId: string): void {
    const active = this.activePlugins.get(pluginId);
    if (!active) return;
    this.cleanupMountedPlugin(pluginId, active.runtimeId);
    this.bumpUi();
  }

  private cleanupMountedPlugin(pluginId: string, runtimeId: symbol): void {
    const active = this.activePlugins.get(pluginId);
    if (!active || active.runtimeId !== runtimeId) return;
    this.activePlugins.delete(pluginId);
    try {
      active.cleanup?.();
    } catch (error) {
      console.error(`[board-plugin:${pluginId}] cleanup failed`, error);
    }
  }

  private createUiEventBus(): BoardPluginEventBus {
    const bus = createBoardPluginEventBus();
    return {
      subscribe: bus.subscribe,
      emit: (event) => {
        bus.emit(event);
        this.bumpUi();
      },
    };
  }

  private bumpUi(): void {
    this.uiRevision += 1;
    for (const listener of [...this.uiListeners]) listener();
  }
}
