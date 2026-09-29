import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { BoardPluginTerminalOverlayProps } from '@/plugin-system';
import { subscribeBoardPluginSettings } from '@/plugin-system';
import { pickTerminalKaomoji, type TerminalStatusKey } from './kaomoji';
import { readKaomojiUiSettings } from './settings';

const TRANSIENT_PHASES = new Set([
  'loading',
  'connecting',
  'hydrating',
  'reconnecting',
  'missing',
  'error',
  'exited',
  'starting',
  'blocked',
  'pending',
]);
const VISIBLE_KEYS = new Set([
  'loading',
  'connecting',
  'hydrating',
  'reconnecting',
  'missing',
  'error',
  'exited',
  'starting',
  'blocked',
  'pending',
]);

function statusKey({ phase, taskStatus }: BoardPluginTerminalOverlayProps['state']): TerminalStatusKey {
  if (phase === 'error' || phase === 'exited') return phase;
  if (phase !== 'ready') return phase;
  return taskStatus ?? 'ready';
}

export function isTerminalStatusVisible(key: TerminalStatusKey): boolean {
  return VISIBLE_KEYS.has(key);
}

export function TerminalStatusOverlay({ state, context }: BoardPluginTerminalOverlayProps) {
  const { t } = useTranslation();
  const [, setSettingsRevision] = useState(0);
  const { pluginId, settingsStorage } = context;
  useEffect(
    () => subscribeBoardPluginSettings(pluginId, () => setSettingsRevision((value) => value + 1)),
    [pluginId],
  );
  const settings = readKaomojiUiSettings(settingsStorage);
  const key = statusKey(state);
  const face = useMemo(() => pickTerminalKaomoji(key), [key]);
  if (!settings.enabled) return null;
  if (!isTerminalStatusVisible(key)) return null;
  const transient = TRANSIENT_PHASES.has(key);
  const label = t(`terminalStatus.${key}.label`, { defaultValue: key });
  const message = state.message || t(`terminalStatus.${key}.message`, { defaultValue: label });
  const tone = key === 'error' || key === 'exited' ? 'is-error' : key === 'working' || key === 'starting' ? 'is-active' : '';

  return (
    <div
      className={`terminal-status-overlay ${transient ? 'is-transient' : 'is-compact'} ${tone} ${settings.animate ? '' : 'is-static'}`}
      role={transient ? 'status' : undefined}
      aria-live={transient ? 'polite' : undefined}
    >
      <div className="terminal-status-overlay__face" aria-hidden="true">
        {face}
      </div>
      <div className="terminal-status-overlay__copy">
        {settings.showLabel && <div className="terminal-status-overlay__label">{label}</div>}
        {transient && settings.showMessage && <div className="terminal-status-overlay__message">{message}</div>}
      </div>
    </div>
  );
}
