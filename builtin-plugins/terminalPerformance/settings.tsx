import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  subscribeBoardPluginSettings,
  type BoardPluginSettingsStorage,
} from '@/plugin-system';
import type { BoardPluginSettingsProps } from '@/plugin-system';

export interface TerminalPerformanceSettings {
  enabled: boolean;
}

export const DEFAULT_TERMINAL_PERFORMANCE_SETTINGS: TerminalPerformanceSettings = {
  enabled: import.meta.env.DEV,
};

const SETTINGS_KEY = 'preferences';

function decodeSettings(value: unknown): TerminalPerformanceSettings | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<TerminalPerformanceSettings>;
  if (typeof candidate.enabled !== 'boolean') return null;
  return { enabled: candidate.enabled };
}

export function readTerminalPerformanceSettings(
  storage: BoardPluginSettingsStorage,
): TerminalPerformanceSettings {
  return storage.get(SETTINGS_KEY, decodeSettings, DEFAULT_TERMINAL_PERFORMANCE_SETTINGS);
}

export function writeTerminalPerformanceSettings(
  storage: BoardPluginSettingsStorage,
  patch: Partial<TerminalPerformanceSettings>,
): TerminalPerformanceSettings {
  const next = { ...readTerminalPerformanceSettings(storage), ...patch };
  storage.set(SETTINGS_KEY, next);
  return next;
}

export function TerminalPerformanceSettingsPanel({
  pluginId,
  settingsStorage,
}: BoardPluginSettingsProps) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  useEffect(
    () => subscribeBoardPluginSettings(pluginId, () => setRevision((value) => value + 1)),
    [pluginId],
  );
  const settings = readTerminalPerformanceSettings(settingsStorage);

  return (
    <div className="space-y-2">
      <SettingToggle
        label={t('terminalPerformance.settings.enabled')}
        hint={t('terminalPerformance.settings.enabledHint')}
        checked={settings.enabled}
        onChange={(enabled) => writeTerminalPerformanceSettings(settingsStorage, { enabled })}
      />
    </div>
  );
}

function SettingToggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-3 text-[12px] text-zinc-300">
      <span className="min-w-0">
        <span className="block">{label}</span>
        <span className="mt-0.5 block text-[10px] leading-4 text-zinc-500">{hint}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 accent-zinc-100"
      />
    </label>
  );
}
