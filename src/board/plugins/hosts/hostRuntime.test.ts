import { describe, expect, it, vi } from 'vitest';
import type { BoardPluginContext, BoardPluginToolbarContribution } from '../types';
import { invokePluginAction, safePluginValue } from './hostRuntime';

function createContext() {
  return {
    notify: {
      info: vi.fn(),
      error: vi.fn(),
    },
  } as unknown as BoardPluginContext;
}

function action(
  onClick: BoardPluginToolbarContribution['onClick'],
): BoardPluginToolbarContribution {
  return {
    id: 'action',
    labelKey: 'plugin.action',
    icon: 'list',
    onClick,
  };
}

describe('plugin host runtime isolation', () => {
  it('returns a safe fallback when a plugin value throws', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(safePluginValue('example', 'badge', 'fallback', () => {
      throw new Error('broken');
    })).toBe('fallback');

    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('contains synchronous plugin action failures', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = createContext();

    invokePluginAction('example', action(() => {
      throw new Error('broken');
    }), context);

    expect(context.notify.error).toHaveBeenCalledWith('Plugin action failed');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('contains asynchronous plugin action failures', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const context = createContext();

    invokePluginAction('example', action(async () => {
      throw new Error('broken');
    }), context);
    await Promise.resolve();
    await Promise.resolve();

    expect(context.notify.error).toHaveBeenCalledWith('Plugin action failed');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
