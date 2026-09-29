import type { BoardPlugin } from '@/plugin-system';
import { TerminalStatusOverlay } from './TerminalStatusOverlay';
import { TERMINAL_STATUS_KAOMOJI } from './kaomoji';
import { KaomojiUiSettingsPanel } from './settings';
import { kaomojiUiTranslations } from './translations';

export const kaomojiUiPlugin: BoardPlugin = {
  id: 'kaomoji-ui',
  version: '1.0.0',
  titleKey: 'kaomojiUi.title',
  translations: kaomojiUiTranslations,
  settings: [{
    id: 'preferences',
    titleKey: 'kaomojiUi.settings.title',
    Settings: KaomojiUiSettingsPanel,
  }],
  terminalOverlays: [{
    id: 'runtime-status',
    order: -100,
    shouldRender: ({ state }) => {
      const key = state.phase === 'ready' ? state.taskStatus ?? 'ready' : state.phase;
      return key in TERMINAL_STATUS_KAOMOJI && !['ready', 'working', 'running', 'idle', 'completed', 'deleted', 'unknown'].includes(key);
    },
    Component: TerminalStatusOverlay,
  }],
};
