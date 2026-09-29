import { describe, expect, it } from 'vitest';
import { BoardPluginRuntimeCore } from './runtimeCore';
import type { BoardPluginEventBus } from './events';
import type { BoardPluginContext } from './types';

function context(pluginId: string, events: BoardPluginEventBus): BoardPluginContext {
  return {
    pluginId,
    editor: {
      getShape: () => undefined,
      getSelectedShapeIds: () => [],
      focusShape: () => {},
      focusTask: () => {},
    },
    tasks: [],
    contentStorage: {} as BoardPluginContext['contentStorage'],
    settingsStorage: {} as BoardPluginContext['settingsStorage'],
    events,
    notify: { info: () => {}, error: () => {} },
  };
}

describe('BoardPluginRuntimeCore', () => {
  it('isolates contexts and events between runtime instances', () => {
    const first = new BoardPluginRuntimeCore();
    const second = new BoardPluginRuntimeCore();
    const plugin = { id: 'isolated', version: '1.0.0', titleKey: 'plugin.title' };
    const firstMounted = first.mount([plugin], (_plugin, events) => context('isolated', events));
    second.mount([plugin], (_plugin, events) => context('isolated', events));

    expect(first.getContext('isolated')).not.toBe(second.getContext('isolated'));

    const firstEvents: string[] = [];
    const secondEvents: string[] = [];
    first.getContext('isolated')?.events.subscribe((event) => firstEvents.push(event.type));
    second.getContext('isolated')?.events.subscribe((event) => secondEvents.push(event.type));

    first.emit({ type: 'terminal-opened', terminalId: 'one' });
    expect(firstEvents).toEqual(['terminal-opened']);
    expect(secondEvents).toEqual([]);

    firstMounted.stop();
    expect(first.getContext('isolated')).toBeUndefined();
    expect(second.getContext('isolated')).toBeDefined();
  });
});
