import { describe, expect, it } from 'vitest';
import i18n, { i18nReady } from './index';
import { registerBoardPlugin, resetBoardPluginRegistryForTests } from '@/board/plugins/registry';
import { installBoardPluginTranslations } from '@/board/plugins/i18n';
import { kaomojiUiPlugin } from '../../builtin-plugins/terminalStatus/plugin';

describe('application language switching', () => {
  it('resolves Chinese resources after switching from English', async () => {
    await i18nReady;
    resetBoardPluginRegistryForTests();
    registerBoardPlugin(kaomojiUiPlugin);
    installBoardPluginTranslations(kaomojiUiPlugin);
    await i18n.changeLanguage('en');
    expect(i18n.t('settings.title')).toBe('Settings');
    await i18n.changeLanguage('zh-CN');
    expect(i18n.t('settings.title')).toBe('设置');
    expect(i18n.t('terminalStatus.connecting.label')).toBe('正在连接');
    expect(i18n.t('kaomojiUi.settings.title')).toBe('颜文字 UI');
    await i18n.changeLanguage('en');
  });
});
