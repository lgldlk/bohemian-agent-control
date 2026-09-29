import { CircleHelp } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  subscribeBoardPluginSettings,
  type BoardPluginSettingsProps,
  type BoardPluginSettingsStorage,
} from '@/plugin-system';
import {
  DEFAULT_RESOURCE_PERFORMANCE_SETTINGS,
  readResourcePerformanceSettings,
  writeResourcePerformanceSettings,
  RESOURCE_PERFORMANCE_PLUGIN_ID,
} from '@/plugin-system';

export function ResourcePerformanceSettingsPanel({ settingsStorage }: BoardPluginSettingsProps) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  useEffect(
    () => subscribeBoardPluginSettings(RESOURCE_PERFORMANCE_PLUGIN_ID, () => setRevision((value) => value + 1)),
    [],
  );
  const settings = readResourcePerformanceSettings(settingsStorage);

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3 text-[12px] text-zinc-300">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span>{t('resourcePerformance.settings.enabled')}</span>
            <HelpTooltip text={t('resourcePerformance.settings.help')} />
          </div>
          <div className="mt-0.5 text-[10px] leading-4 text-zinc-500">
            {t('resourcePerformance.settings.enabledHint')}
          </div>
        </div>
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(event) => writeResourcePerformanceSettings(settingsStorage, { enabled: event.target.checked })}
          className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-100"
        />
      </div>

      <label className="flex items-center justify-between gap-3 text-[12px] text-zinc-300">
        <span>
          {t('resourcePerformance.settings.threshold')}
          <span className="ml-1 text-[10px] text-zinc-600">{t('resourcePerformance.settings.windows')}</span>
        </span>
        <input
          type="number"
          min={2}
          max={100}
          step={1}
          value={settings.resourceThreshold}
          onChange={(event) => writeResourcePerformanceSettings(settingsStorage, {
            resourceThreshold: Number(event.target.value) || DEFAULT_RESOURCE_PERFORMANCE_SETTINGS.resourceThreshold,
          })}
          className="w-20 border border-zinc-700 bg-zinc-900 px-2 py-1 text-right text-xs text-zinc-100 outline-none focus:border-zinc-400"
        />
      </label>
    </div>
  );
}

function HelpTooltip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex" tabIndex={0}>
      <CircleHelp size={13} className="text-zinc-600 group-hover:text-zinc-200 group-focus:text-zinc-200" />
      <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-2 hidden w-64 border border-zinc-700 bg-zinc-950 p-2 text-[10px] leading-4 text-zinc-300 shadow-2xl group-hover:block group-focus:block">
        {text}
      </span>
    </span>
  );
}
