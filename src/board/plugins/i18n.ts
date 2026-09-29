import { addAppTranslations } from '@/i18n';
import type { BoardPlugin } from './types';

/** Host adapter: the core registry stays independent from the application's i18n instance. */
export function installBoardPluginTranslations(plugin: Pick<BoardPlugin, 'translations'>): void {
  for (const [language, resources] of Object.entries(plugin.translations ?? {})) {
    addAppTranslations(language, resources as Record<string, unknown>);
  }
}

