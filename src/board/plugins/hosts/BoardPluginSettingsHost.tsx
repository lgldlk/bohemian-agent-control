import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { BoardPluginErrorBoundary } from '../BoardPluginErrorBoundary';
import { listBoardPlugins } from '../registry';
import { createBoardPluginSettingsStorage } from '../storage';
import type { BoardPluginSettingsProps } from '../types';

export function BoardPluginSettingsHost() {
  const { t } = useTranslation();
  const settings = useMemo(() => listBoardPlugins()
    .flatMap((plugin) => (plugin.settings ?? []).map((setting) => ({ plugin, setting })))
    .sort((a, b) => (a.setting.order ?? 0) - (b.setting.order ?? 0)), []);

  if (!settings.length) {
    return <p className="text-[11px] leading-5 text-zinc-500">{t('settings.pluginsEmpty')}</p>;
  }

  return (
    <div className="divide-y divide-zinc-800">
      {settings.map(({ plugin, setting }) => {
        const Settings = setting.Settings;
        const props: BoardPluginSettingsProps = {
          pluginId: plugin.id,
          settingsStorage: createBoardPluginSettingsStorage(plugin.id),
        };
        return (
          <section key={`${plugin.id}:${setting.id}`} className="space-y-3 py-4 first:pt-0 last:pb-0">
            <div className="text-[10px] uppercase tracking-[0.14em] text-zinc-500">
              {t(setting.titleKey)}
            </div>
            <BoardPluginErrorBoundary
              pluginId={plugin.id}
              fallback={(
                <div role="alert" className="text-xs text-zinc-500">
                  {t('settings.pluginUnavailable')}
                </div>
              )}
            >
              <Settings {...props} />
            </BoardPluginErrorBoundary>
          </section>
        );
      })}
    </div>
  );
}
