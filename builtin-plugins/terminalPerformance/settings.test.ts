import { describe, expect, it } from 'vitest';
import type { BoardPluginSettingsStorage } from '@/plugin-system';
import {
  DEFAULT_TERMINAL_PERFORMANCE_SETTINGS,
  readTerminalPerformanceSettings,
  writeTerminalPerformanceSettings,
} from './settings';

function fakeStorage(): BoardPluginSettingsStorage {
  const values = new Map<string, unknown>();
  return {
    get<T>(key: string, decode: (value: unknown) => T | null, fallback: T): T {
      const value = decode(values.get(key));
      return value ?? fallback;
    },
    set<T>(key: string, value: T) {
      values.set(key, value);
    },
    remove(key: string) {
      values.delete(key);
    },
  };
}

describe('terminal performance settings', () => {
  it('uses the development default and validates persisted values', () => {
    const storage = fakeStorage();
    expect(readTerminalPerformanceSettings(storage)).toEqual(DEFAULT_TERMINAL_PERFORMANCE_SETTINGS);
    storage.set('preferences', { enabled: 'yes', showTerminals: true });
    expect(readTerminalPerformanceSettings(storage)).toEqual(DEFAULT_TERMINAL_PERFORMANCE_SETTINGS);
  });

  it('persists user changes independently', () => {
    const storage = fakeStorage();
    const next = writeTerminalPerformanceSettings(storage, { enabled: false });
    expect(next.enabled).toBe(false);
    expect(readTerminalPerformanceSettings(storage)).toEqual(next);
  });
});
