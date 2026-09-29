import { useEffect, useMemo, useState } from 'react';
import { createBoardPluginSettingsStorage, subscribeBoardPluginSettings } from '@/board/plugins/storage/settingsStorage';
import type { BoardPluginSettingsStorage } from '@/board/plugins/storage/contracts';

export const RESOURCE_PERFORMANCE_PLUGIN_ID = 'resource-performance';
export const RESOURCE_PERFORMANCE_SETTINGS_KEY = 'preferences';

export interface ResourcePerformanceSettings {
  enabled: boolean;
  resourceThreshold: number;
}

export const DEFAULT_RESOURCE_PERFORMANCE_SETTINGS: ResourcePerformanceSettings = {
  enabled: true,
  resourceThreshold: 8,
};

function decodeResourcePerformanceSettings(value: unknown): ResourcePerformanceSettings | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<ResourcePerformanceSettings>;
  if (typeof candidate.enabled !== 'boolean' || typeof candidate.resourceThreshold !== 'number') return null;
  if (!Number.isInteger(candidate.resourceThreshold) || candidate.resourceThreshold < 2 || candidate.resourceThreshold > 100) return null;
  return {
    enabled: candidate.enabled,
    resourceThreshold: candidate.resourceThreshold,
  };
}

export function readResourcePerformanceSettings(
  storage: BoardPluginSettingsStorage,
): ResourcePerformanceSettings {
  return storage.get(
    RESOURCE_PERFORMANCE_SETTINGS_KEY,
    decodeResourcePerformanceSettings,
    DEFAULT_RESOURCE_PERFORMANCE_SETTINGS,
  );
}

export function writeResourcePerformanceSettings(
  storage: BoardPluginSettingsStorage,
  patch: Partial<ResourcePerformanceSettings>,
): ResourcePerformanceSettings {
  const current = readResourcePerformanceSettings(storage);
  const next: ResourcePerformanceSettings = {
    enabled: patch.enabled ?? current.enabled,
    resourceThreshold: Math.min(100, Math.max(2, Math.round(patch.resourceThreshold ?? current.resourceThreshold))),
  };
  storage.set(RESOURCE_PERFORMANCE_SETTINGS_KEY, next);
  return next;
}

export function useResourcePerformanceSettings(): ResourcePerformanceSettings {
  const storage = useMemo(
    () => createBoardPluginSettingsStorage(RESOURCE_PERFORMANCE_PLUGIN_ID),
    [],
  );
  const [, setRevision] = useState(0);
  useEffect(
    () => subscribeBoardPluginSettings(RESOURCE_PERFORMANCE_PLUGIN_ID, () => setRevision((value) => value + 1)),
    [],
  );
  return readResourcePerformanceSettings(storage);
}

export function resourcePerformanceStorage(): BoardPluginSettingsStorage {
  return createBoardPluginSettingsStorage(RESOURCE_PERFORMANCE_PLUGIN_ID);
}

export function shouldDeferResource(
  settings: ResourcePerformanceSettings,
  resourceWindowCount: number,
  active: boolean,
): boolean {
  return settings.enabled && resourceWindowCount >= settings.resourceThreshold && !active;
}
