import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  getTerminalPerformanceHistory,
  getTerminalPerformanceSnapshot,
  subscribeTerminalPerformance,
  type TerminalPerformanceHistoryPoint,
  type TerminalPerformanceSnapshot,
} from '@bohemian/terminal-ui';
import { subscribeBoardPluginSettings } from '@/plugin-system';
import type { BoardPluginOverlayProps } from '@/plugin-system';
import {
  readTerminalPerformanceSettings,
  type TerminalPerformanceSettings,
} from './settings';

const EMPTY_SNAPSHOT: TerminalPerformanceSnapshot = getTerminalPerformanceSnapshot();
const CHART_HISTORY_SIZE = 36;

export function TerminalPerformanceOverlay({
  context,
}: BoardPluginOverlayProps) {
  const { t } = useTranslation();
  const [, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(EMPTY_SNAPSHOT);
  const [history, setHistory] = useState<readonly TerminalPerformanceHistoryPoint[]>(getTerminalPerformanceHistory());
  const settings: TerminalPerformanceSettings = readTerminalPerformanceSettings(context.settingsStorage);
  useEffect(
    () => subscribeBoardPluginSettings(context.pluginId, () => setRevision((value) => value + 1)),
    [context.pluginId],
  );
  useEffect(
    () => {
      if (!settings.enabled) return;
      return subscribeTerminalPerformance(() => {
        const next = getTerminalPerformanceSnapshot();
        setSnapshot(next);
        setHistory(getTerminalPerformanceHistory());
      });
    },
    [settings.enabled],
  );

  if (!settings.enabled) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <aside
      aria-label={t('terminalPerformance.title')}
      className="pointer-events-none fixed bottom-16 left-3 z-[180000] w-[220px] border border-emerald-800/70 bg-zinc-950/95 p-2 font-mono text-[10px] text-zinc-300 shadow-2xl"
    >
      <div className="mb-1 flex items-center justify-between border-b border-zinc-800 pb-1 text-[10px] uppercase tracking-wide text-emerald-300">
        <span>{t('terminalPerformance.title')}</span>
        <span className="text-zinc-600">DEV</span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <ChartCard
          label={t('terminalPerformance.metrics.fps')}
          value={formatMetric(snapshot.fps, 'fps')}
          values={history.map((point) => point.fps)}
          color="#34d399"
          max={60}
        />
        <ChartCard
          label={t('terminalPerformance.metrics.frame')}
          value={formatMetric(snapshot.frameTimeMs, 'ms')}
          values={history.map((point) => point.frameTimeMs)}
          color="#fbbf24"
          max={32}
        />
      </div>
    </aside>,
    document.body,
  );
}

function ChartCard({
  label,
  value,
  values,
  color,
  max,
}: {
  label: string;
  value: string;
  values: readonly number[];
  color: string;
  max?: number;
}) {
  return (
    <div className="min-w-0 border border-zinc-800 bg-zinc-900/70 p-1">
      <div className="flex items-center justify-between gap-1">
        <span className="truncate text-zinc-500">{label}</span>
        <span className="shrink-0 tabular-nums text-zinc-100">{value}</span>
      </div>
      <BarChart values={values} color={color} max={max} />
    </div>
  );
}

function BarChart({
  values,
  color,
  max,
}: {
  values: readonly number[];
  color: string;
  max?: number;
}) {
  const upperBound = Math.max(max ?? 0, ...values, 1);
  const barWidth = 100 / CHART_HISTORY_SIZE;
  return (
    <svg
      aria-hidden="true"
      className="mt-1 h-7 w-full"
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
    >
      <line x1="0" y1="27.5" x2="100" y2="27.5" stroke="#27272a" strokeWidth="1" />
      {values.map((value, index) => {
        const height = Math.max(1, (value / upperBound) * 26);
        return (
          <rect
            key={`${index}-${value}`}
            x={index * barWidth + 0.3}
            y={28 - height}
            width={Math.max(0.8, barWidth - 0.7)}
            height={height}
            fill={color}
            opacity={0.8}
          />
        );
      })}
    </svg>
  );
}

function formatMetric(value: number, unit: string): string {
  return value > 0 ? `${value.toFixed(value >= 10 ? 0 : 1)}${unit}` : '—';
}
