import { readLocalJson, writeLocalJson } from '@/lib/localJson';
import type { BoardPluginSettingsStorage } from './contracts';

export const BOARD_PLUGIN_SETTINGS_CHANGED_EVENT = 'bohemian-agent-control:plugin-settings-changed';

function settingsKey(pluginId: string, key: string): string {
  return `bohemian-agent-control:plugin:${pluginId}:settings:v1:${key}`;
}

function storageAvailable(): boolean {
  return typeof localStorage !== 'undefined';
}

export function subscribeBoardPluginSettings(
  pluginId: string,
  listener: () => void,
): () => void {
  if (typeof window === 'undefined') return () => {};
  const onChange = (event: Event) => {
    const detail = (event as CustomEvent<{ pluginId?: string }>).detail;
    if (!detail?.pluginId || detail.pluginId === pluginId) listener();
  };
  window.addEventListener(BOARD_PLUGIN_SETTINGS_CHANGED_EVENT, onChange);
  return () => window.removeEventListener(BOARD_PLUGIN_SETTINGS_CHANGED_EVENT, onChange);
}

export function createBoardPluginSettingsStorage(pluginId: string): BoardPluginSettingsStorage {
  return {
    get<T>(key: string, decode: (value: unknown) => T | null, fallback: T) {
      return readLocalJson(settingsKey(pluginId, key), decode, () => fallback);
    },
    set<T>(key: string, value: T) {
      writeLocalJson(settingsKey(pluginId, key), value);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(BOARD_PLUGIN_SETTINGS_CHANGED_EVENT, {
          detail: { pluginId, key },
        }));
      }
    },
    remove(key: string) {
      if (!storageAvailable()) return;
      try {
        localStorage.removeItem(settingsKey(pluginId, key));
      } catch {
        // Browser storage is optional.
      }
    },
  };
}
