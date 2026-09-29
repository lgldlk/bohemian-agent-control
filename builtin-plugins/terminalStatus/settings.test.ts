import { describe, expect, it } from 'vitest';
import {
  DEFAULT_KAOMOJI_UI_SETTINGS,
  readKaomojiUiSettings,
  writeKaomojiUiSettings,
} from './settings';
import type { BoardPluginSettingsStorage } from '@/plugin-system';

function fakeStorage(): BoardPluginSettingsStorage {
  let value: unknown;
  return {
    get: <T>(_key: string, decode: (raw: unknown) => T | null, fallback: T) => decode(value) ?? fallback,
    set: (_key, next) => {
      value = next;
    },
    remove: () => {
      value = undefined;
    },
  };
}

describe('kaomoji UI settings', () => {
  it('falls back safely and merges partial updates', () => {
    const storage = fakeStorage();
    expect(readKaomojiUiSettings(storage)).toEqual(DEFAULT_KAOMOJI_UI_SETTINGS);
    expect(writeKaomojiUiSettings(storage, { showMessage: false })).toEqual({
      ...DEFAULT_KAOMOJI_UI_SETTINGS,
      showMessage: false,
    });
    expect(readKaomojiUiSettings(storage).showMessage).toBe(false);
  });
});

