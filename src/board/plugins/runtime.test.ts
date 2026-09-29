import { describe, expect, it, vi } from 'vitest';
import type { Editor, TLShapeId } from 'tldraw';
import { registerBoardPlugin, resetBoardPluginRegistryForTests, unregisterBoardPlugin } from './registry';
import {
  BoardPluginRuntimeCore,
  emitBoardPluginEvent,
  executeBoardPluginCommand,
  getDefaultBoardPluginRuntime,
  getBoardPluginContext,
  getBoardPluginUiRevision,
  mountBoardPluginRuntime,
  subscribeBoardPluginUi,
} from './runtime';

function fakeEditor() {
  const listeners = new Map<string, Set<(payload?: unknown) => void>>();
  const editor = {
    getShape: () => undefined,
    getSelectedShapeIds: () => ['shape:1' as TLShapeId],
    setSelectedShapes: () => undefined,
    zoomToSelection: () => undefined,
    on(event: string, handler: (payload?: unknown) => void) {
      const set = listeners.get(event) ?? new Set();
      set.add(handler);
      listeners.set(event, set);
    },
    off(event: string, handler: (payload?: unknown) => void) {
      listeners.get(event)?.delete(handler);
    },
  };
  return { editor: editor as unknown as Editor, listeners };
}

describe('mountBoardPluginRuntime', () => {
  it('creates the event bus the runtime emits on', () => {
    resetBoardPluginRegistryForTests();
    const seen: string[] = [];
    registerBoardPlugin({
      id: 'runtime-test',
      version: '1.0.0',
      titleKey: 'usage.title',
      setup(context) {
        return context.subscribe((event) => {
          seen.push(event.type);
        });
      },
    });
    const { editor, listeners } = fakeEditor();
    const stop = mountBoardPluginRuntime(editor, { current: [] });

    listeners.get('change')?.forEach((handler) => handler());
    emitBoardPluginEvent({ type: 'terminal-opened', terminalId: 'pty-1' });
    expect(seen).toEqual(['selection-changed', 'terminal-opened']);

    stop();
    emitBoardPluginEvent({ type: 'terminal-closed', terminalId: 'pty-1' });
    expect(seen).toEqual(['selection-changed', 'terminal-opened']);
    expect(listeners.get('change')?.size ?? 0).toBe(0);
  });

  it('passes the live context to commands and clears it on unmount', () => {
    resetBoardPluginRegistryForTests();
    let commandContext: unknown;
    registerBoardPlugin({
      id: 'command-test',
      version: '1.0.0',
      titleKey: 'usage.title',
      commands: [{
        id: 'inspect',
        labelKey: 'usage.title',
        execute: (context) => {
          commandContext = context;
        },
      }],
    });
    const { editor } = fakeEditor();
    const stop = mountBoardPluginRuntime(editor, { current: [] });

    expect(executeBoardPluginCommand('command-test', 'inspect')).toBeUndefined();
    expect(commandContext).toBe(getBoardPluginContext('command-test'));
    expect(getBoardPluginContext('command-test')?.pluginId).toBe('command-test');

    stop();
    expect(getBoardPluginContext('command-test')).toBeUndefined();
    expect(executeBoardPluginCommand('command-test', 'inspect')).toBeUndefined();
  });

  it('notifies host UI when the runtime mounts, selection changes, and unmounts', () => {
    resetBoardPluginRegistryForTests();
    registerBoardPlugin({
      id: 'ui-host',
      version: '1.0.0',
      titleKey: 'usage.title',
    });
    const revisions: number[] = [];
    const stopUi = subscribeBoardPluginUi(() => {
      revisions.push(getBoardPluginUiRevision());
    });
    const before = getBoardPluginUiRevision();
    const { editor, listeners } = fakeEditor();
    const stop = mountBoardPluginRuntime(editor, { current: [] });

    expect(getBoardPluginContext('ui-host')).toBeDefined();
    expect(getBoardPluginUiRevision()).toBeGreaterThan(before);
    const afterMount = getBoardPluginUiRevision();

    listeners.get('change')?.forEach((handler) => handler());
    expect(getBoardPluginUiRevision()).toBeGreaterThan(afterMount);
    const afterSelection = getBoardPluginUiRevision();
    listeners.get('change')?.forEach((handler) => handler());
    expect(getBoardPluginUiRevision()).toBe(afterSelection);

    emitBoardPluginEvent({ type: 'terminal-opened', terminalId: 'pty-1' });
    expect(getBoardPluginUiRevision()).toBeGreaterThan(afterSelection);

    stop();
    expect(getBoardPluginContext('ui-host')).toBeUndefined();
    const afterStop = getBoardPluginUiRevision();
    emitBoardPluginEvent({ type: 'terminal-closed', terminalId: 'pty-1' });
    expect(getBoardPluginUiRevision()).toBe(afterStop);
    expect(revisions.length).toBeGreaterThan(0);
    stopUi();
  });

  it('contains asynchronous command failures', async () => {
    resetBoardPluginRegistryForTests();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerBoardPlugin({
      id: 'failing-command-test',
      version: '1.0.0',
      titleKey: 'usage.title',
      commands: [{
        id: 'reject',
        labelKey: 'usage.title',
        execute: async () => {
          throw new Error('command failed');
        },
      }],
    });
    const { editor } = fakeEditor();
    const stop = mountBoardPluginRuntime(editor, { current: [] });

    await expect(executeBoardPluginCommand('failing-command-test', 'reject')).resolves.toBeUndefined();

    stop();
    error.mockRestore();
  });

  it('cleans a mounted plugin when it is unregistered', () => {
    resetBoardPluginRegistryForTests();
    let cleanups = 0;
    registerBoardPlugin({
      id: 'unregister-test',
      version: '1.0.0',
      titleKey: 'usage.title',
      setup: () => () => {
        cleanups += 1;
      },
    });
    const { editor } = fakeEditor();
    const stop = mountBoardPluginRuntime(editor, { current: [] });

    expect(unregisterBoardPlugin('unregister-test')).toBe(true);
    expect(getBoardPluginContext('unregister-test')).toBeUndefined();
    expect(cleanups).toBe(1);

    stop();
    expect(cleanups).toBe(1);
  });

  it('rolls back runtime state when editor event attachment fails', () => {
    resetBoardPluginRegistryForTests();
    registerBoardPlugin({
      id: 'mount-rollback-test',
      version: '1.0.0',
      titleKey: 'usage.title',
    });
    const runtime = new BoardPluginRuntimeCore();
    const { editor } = fakeEditor();
    editor.on = () => {
      throw new Error('cannot attach editor events');
    };

    expect(() => mountBoardPluginRuntime(editor, { current: [] }, runtime))
      .toThrow('cannot attach editor events');
    expect(runtime.getContext('mount-rollback-test')).toBeUndefined();
    expect(getDefaultBoardPluginRuntime()).not.toBe(runtime);
  });

});
