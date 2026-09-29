/**
 * Public plugin SDK surface.
 *
 * Built-in and future external plugins import this facade instead of reaching
 * into board host/runtime implementation files.
 */
export * from '@/board/plugins/types';
export * from '@/board/plugins/resourceTypes';
export {
  DEFAULT_RESOURCE_PERFORMANCE_SETTINGS,
  RESOURCE_PERFORMANCE_PLUGIN_ID,
  readResourcePerformanceSettings,
  resourcePerformanceStorage,
  shouldDeferResource,
  useResourcePerformanceSettings,
  writeResourcePerformanceSettings,
} from './resourcePerformance';
export {
  createBoardPluginSettingsStorage,
  subscribeBoardPluginSettings,
} from '@/board/plugins/storage/settingsStorage';
export type {
  BoardPluginContentStorage,
  BoardPluginSettingsStorage,
  PluginDataCodec,
} from '@/board/plugins/storage/contracts';
export type { UserPluginHostSdk } from './user-plugins/loader';
