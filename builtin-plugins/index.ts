import { registerBoardPlugin } from '@/board/plugins/registry';
import { installBoardPluginTranslations } from '@/board/plugins/i18n';
import { tokenUsagePlugin } from './tokenUsage/plugin.tsx';
import { kaomojiUiPlugin } from './terminalStatus/plugin';
import { localFilePlugin } from './localFile/plugin';
import { webUrlPlugin } from './webUrl/plugin';
import { terminalPerformancePlugin } from './terminalPerformance/plugin';

let ready = false;

/** 内置插件只在这里注册。画板宿主不认识具体插件。 */
export function ensureBoardPlugins(): void {
  if (ready) return;
  ready = true;
  for (const plugin of [
    tokenUsagePlugin,
    kaomojiUiPlugin,
    localFilePlugin,
    webUrlPlugin,
    terminalPerformancePlugin,
  ]) {
    registerBoardPlugin(plugin);
    installBoardPluginTranslations(plugin);
  }
}
