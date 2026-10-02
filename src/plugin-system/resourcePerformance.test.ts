import { describe, expect, it } from 'vitest';
import type { BoardPluginSettingsStorage } from '@/board/plugins/storage/contracts';
import {
  DEFAULT_RESOURCE_PERFORMANCE_SETTINGS,
  readResourcePerformanceSettings,
  writeResourcePerformanceSettings,
} from './resourcePerformance';

function storage(initial?: unknown): BoardPluginSettingsStorage {
  let value = initial;
  return {
    get: (_key, decode, fallback) => decode(value) ?? fallback,
    set: (_key, next) => { value = next; },
    remove: () => { value = undefined; },
  };
}

describe('resource performance settings', () => {
  it('uses safe defaults and clamps the user threshold', () => {
    const target = storage();
    expect(readResourcePerformanceSettings(target)).toEqual(DEFAULT_RESOURCE_PERFORMANCE_SETTINGS);
    expect(writeResourcePerformanceSettings(target, { resourceThreshold: 1000 }).resourceThreshold).toBe(100);
    expect(writeResourcePerformanceSettings(target, { resourceThreshold: 1 }).resourceThreshold).toBe(2);
  });
});
