import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  subscribeBoardPluginSettings,
  type BoardPluginSettingsStorage,
} from '@/plugin-system';
import type { BoardPluginSettingsProps } from '@/plugin-system';

export interface KaomojiUiSettings {
  enabled: boolean;
  showMessage: boolean;
  showLabel: boolean;
  animate: boolean;
}

export const DEFAULT_KAOMOJI_UI_SETTINGS: KaomojiUiSettings = {
  enabled: true,
  showMessage: true,
  showLabel: true,
  animate: true,
};

const SETTINGS_KEY = 'preferences';

function decodeSettings(value: unknown): KaomojiUiSettings | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<KaomojiUiSettings>;
  if (
    typeof candidate.enabled !== 'boolean'
    || typeof candidate.showMessage !== 'boolean'
    || typeof candidate.showLabel !== 'boolean'
    || typeof candidate.animate !== 'boolean'
  ) return null;
  return candidate as KaomojiUiSettings;
}

export function readKaomojiUiSettings(storage: BoardPluginSettingsStorage): KaomojiUiSettings {
  return storage.get(SETTINGS_KEY, decodeSettings, DEFAULT_KAOMOJI_UI_SETTINGS);
}

export function writeKaomojiUiSettings(
  storage: BoardPluginSettingsStorage,
  patch: Partial<KaomojiUiSettings>,
): KaomojiUiSettings {
  const next = { ...readKaomojiUiSettings(storage), ...patch };
  storage.set(SETTINGS_KEY, next);
  return next;
}

export function KaomojiUiSettingsPanel({ pluginId, settingsStorage }: BoardPluginSettingsProps) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  useEffect(() => subscribeBoardPluginSettings(pluginId, () => setRevision((value) => value + 1)), [pluginId]);
  const settings = readKaomojiUiSettings(settingsStorage);

  return (
    <div className="space-y-2">
      <SettingToggle
        label={t('kaomojiUi.settings.enabled')}
        hint={t('kaomojiUi.settings.enabledHint')}
        checked={settings.enabled}
        onChange={(checked) => writeKaomojiUiSettings(settingsStorage, { enabled: checked })}
      />
      <SettingToggle
        label={t('kaomojiUi.settings.showMessage')}
        hint={t('kaomojiUi.settings.showMessageHint')}
        checked={settings.showMessage}
        onChange={(checked) => writeKaomojiUiSettings(settingsStorage, { showMessage: checked })}
      />
      <SettingToggle
        label={t('kaomojiUi.settings.showLabel')}
        hint={t('kaomojiUi.settings.showLabelHint')}
        checked={settings.showLabel}
        onChange={(checked) => writeKaomojiUiSettings(settingsStorage, { showLabel: checked })}
      />
      <SettingToggle
        label={t('kaomojiUi.settings.animate')}
        hint={t('kaomojiUi.settings.animateHint')}
        checked={settings.animate}
        onChange={(checked) => writeKaomojiUiSettings(settingsStorage, { animate: checked })}
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
