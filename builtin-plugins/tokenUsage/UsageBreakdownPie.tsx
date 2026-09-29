import { useEffect, useMemo, useState } from 'react';
import { formatTokenCount } from '@/lib/tokenFormat';

export interface UsageBreakdownRow {
  key: string;
  tokens: number;
  sessions: number;
  missing: number;
}

export type UsagePieVariant = 'donut' | 'solid' | 'radial';

const MAX_SEGMENTS = 8;
const DEFAULT_LEGEND_ROWS = 5;

function formatTokens(value: number): string {
  return formatTokenCount(value) ?? '0';
}

/** Stable blue-family color: a category keeps its identity across filters and sorting. */
export function usageColorForKey(key: string): string {
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const unsigned = hash >>> 0;
  const hue = 204 + unsigned % 18;
  const saturation = 54 + (unsigned >>> 7) % 24;
  const lightness = 38 + (unsigned >>> 15) % 22;
  return `hsl(${hue} ${saturation}% ${lightness}%)`;
}

function compactRows(rows: readonly UsageBreakdownRow[]): UsageBreakdownRow[] {
  if (rows.length <= MAX_SEGMENTS) return [...rows];
  const head = rows.slice(0, MAX_SEGMENTS - 1);
  const tail = rows.slice(MAX_SEGMENTS - 1);
  return [
    ...head,
    {
      key: '其他',
      tokens: tail.reduce((sum, row) => sum + row.tokens, 0),
      sessions: tail.reduce((sum, row) => sum + row.sessions, 0),
      missing: tail.reduce((sum, row) => sum + row.missing, 0),
    },
  ];
}

export function UsageBreakdownPie({
  title,
  rows,
  variant,
  eyebrow,
}: {
  title: string;
  rows: readonly UsageBreakdownRow[];
  variant: UsagePieVariant;
  eyebrow: string;
}) {
  const chartRows = useMemo(() => compactRows(rows), [rows]);
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(() => new Set());
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const colorByKey = useMemo(
    () => Object.fromEntries(chartRows.map((row) => [row.key, usageColorForKey(row.key)])),
    [chartRows],
  );
  const visibleRows = useMemo(
    () => chartRows.filter((row) => !hiddenKeys.has(row.key)),
    [chartRows, hiddenKeys],
  );
  const visibleTotal = visibleRows.reduce((sum, row) => sum + row.tokens, 0);
  const legendRows = expanded ? chartRows : chartRows.slice(0, DEFAULT_LEGEND_ROWS);
  const hoveredRow = chartRows.find((row) => row.key === hoveredKey && !hiddenKeys.has(row.key)) ?? null;

  useEffect(() => {
    const available = new Set(chartRows.map((row) => row.key));
    setHiddenKeys((current) => {
      const next = new Set([...current].filter((key) => available.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [chartRows]);

  const toggleRow = (key: string) => {
    setHiddenKeys((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="px-card min-h-[292px] p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="pixel-font text-[7px] text-[#3294ee]">{eyebrow}</div>
          <h2 className="mt-1.5 text-sm font-medium text-zinc-100">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          {hiddenKeys.size > 0 ? (
            <button className="text-[9px] text-[#8fc8fa] hover:text-white" type="button" onClick={() => setHiddenKeys(new Set())}>RESET</button>
          ) : null}
          <span className="text-[10px] tabular-nums text-zinc-600">{rows.length} 类</span>
        </div>
      </div>

      {chartRows.length === 0 ? (
        <div className="flex h-52 items-center justify-center text-xs text-zinc-600">暂无会话</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-[132px_minmax(0,1fr)] items-center gap-4">
            <PieVisual
              colorByKey={colorByKey}
              hoveredKey={hoveredKey}
              hoveredRow={hoveredRow}
              rows={visibleRows}
              total={visibleTotal}
              variant={variant}
              onHover={setHoveredKey}
            />
            <div className="min-w-0 space-y-1.5">
              {legendRows.map((row) => {
                const hidden = hiddenKeys.has(row.key);
                const share = visibleTotal > 0 && !hidden ? row.tokens / visibleTotal * 100 : 0;
                return (
                  <button
                    aria-pressed={!hidden}
                    className={`grid w-full grid-cols-[8px_minmax(0,1fr)_auto] items-center gap-2 px-1 py-1 text-left text-[11px] transition-colors hover:bg-[#18202b] ${hidden ? 'opacity-40' : ''}`}
                    key={row.key}
                    title={hidden ? `显示 ${row.key}` : `隐藏 ${row.key}`}
                    type="button"
                    onClick={() => toggleRow(row.key)}
                    onFocus={() => setHoveredKey(row.key)}
                    onBlur={() => setHoveredKey(null)}
                    onMouseEnter={() => setHoveredKey(row.key)}
                    onMouseLeave={() => setHoveredKey(null)}
                  >
                    <i className="size-2" style={{ backgroundColor: hidden ? '#3f3f46' : colorByKey[row.key] }} />
                    <span className="min-w-0">
                      <span className={`block truncate text-zinc-300 ${hidden ? 'line-through' : ''}`} title={row.key}>{row.key}</span>
                      <span className="mt-0.5 block text-[9px] text-zinc-600">{row.sessions} 会话{row.missing > 0 ? ` · ${row.missing} 缺失` : ''}</span>
                    </span>
                    <span className="text-right">
                      <span className="block tabular-nums text-zinc-400">{formatTokens(row.tokens)}</span>
                      <span className="mt-0.5 block tabular-nums text-[9px] text-zinc-600">{hidden ? '—' : `${share.toFixed(1)}%`}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {chartRows.length > DEFAULT_LEGEND_ROWS ? (
            <button
              className="mt-3 w-full border-t border-zinc-800 pt-2 text-center text-[10px] text-zinc-500 hover:text-zinc-200"
              type="button"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? '收起' : `查看全部（${chartRows.length}）`}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

function PieVisual({
  colorByKey,
  hoveredKey,
  hoveredRow,
  rows,
  total,
  variant,
  onHover,
}: {
  colorByKey: Record<string, string>;
  hoveredKey: string | null;
  hoveredRow: UsageBreakdownRow | null;
  rows: UsageBreakdownRow[];
  total: number;
  variant: UsagePieVariant;
  onHover: (key: string | null) => void;
}) {
  const tooltipShare = hoveredRow && total > 0 ? hoveredRow.tokens / total * 100 : 0;
  return (
    <div className="relative mx-auto size-32">
      {variant === 'radial' ? (
        <RadialSegments colorByKey={colorByKey} hoveredKey={hoveredKey} rows={rows} total={total} onHover={onHover} />
      ) : (
        <PieSegments colorByKey={colorByKey} hoveredKey={hoveredKey} rows={rows} total={total} variant={variant} onHover={onHover} />
      )}

      {variant === 'donut' ? (
        <div className="pointer-events-none absolute inset-[25%] flex flex-col items-center justify-center rounded-full border border-[#26384c] bg-[#101014] text-center">
          <span className="pixel-font text-[6px] text-zinc-600">TOTAL</span>
          <span className="mt-1 max-w-[68px] truncate text-xs font-semibold tabular-nums text-zinc-100">{formatTokens(total)}</span>
        </div>
      ) : variant === 'radial' ? (
        <div className="pointer-events-none absolute inset-[35%] flex items-center justify-center border border-[#294c70] bg-[#101014] text-[9px] font-semibold tabular-nums text-zinc-200">{rows.length}</div>
      ) : null}

      {hoveredRow ? (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 min-w-28 -translate-x-1/2 -translate-y-1/2 border border-[#294c70] bg-[#0b1119]/95 px-2 py-1.5 text-center shadow-lg">
          <div className="max-w-32 truncate text-[10px] text-zinc-200">{hoveredRow.key}</div>
          <div className="mt-0.5 text-[9px] tabular-nums text-[#8fc8fa]">{formatTokens(hoveredRow.tokens)} · {tooltipShare.toFixed(1)}%</div>
        </div>
      ) : null}
    </div>
  );
}

function PieSegments({
  colorByKey,
  hoveredKey,
  rows,
  total,
  variant,
  onHover,
}: {
  colorByKey: Record<string, string>;
  hoveredKey: string | null;
  rows: UsageBreakdownRow[];
  total: number;
  variant: Exclude<UsagePieVariant, 'radial'>;
  onHover: (key: string | null) => void;
}) {
  let cursor = 0;
  const circumference = 2 * Math.PI * 50;
  return (
    <svg aria-label={`${variant === 'donut' ? '环形' : '实心'}用量分布，总计 ${formatTokens(total)}`} className="size-32" role="img" viewBox="0 0 128 128">
      <circle cx="64" cy="64" r="56" fill="#111923" stroke="#26384c" />
      {rows.map((row) => {
        if (row.tokens <= 0 || total <= 0) return null;
        const share = row.tokens / total;
        const start = cursor;
        cursor += share;
        const dimmed = hoveredKey != null && hoveredKey !== row.key;
        if (variant === 'donut') {
          const gap = Math.min(0.008, share / 4);
          return (
            <circle
              cx="64"
              cy="64"
              fill="none"
              key={row.key}
              opacity={dimmed ? 0.28 : 1}
              r="50"
              stroke={colorByKey[row.key]}
              strokeDasharray={`${Math.max(0, share - gap) * circumference} ${circumference}`}
              strokeDashoffset={-start * circumference}
              strokeWidth="16"
              transform="rotate(-90 64 64)"
              onFocus={() => onHover(row.key)}
              onBlur={() => onHover(null)}
              onMouseEnter={() => onHover(row.key)}
              onMouseLeave={() => onHover(null)}
            />
          );
        }
        return (
          <path
            d={sectorPath(64, 64, 54, start * 360, cursor * 360)}
            fill={colorByKey[row.key]}
            key={row.key}
            opacity={dimmed ? 0.28 : 1}
            stroke="#0a0a0d"
            strokeWidth="1.5"
            onFocus={() => onHover(row.key)}
            onBlur={() => onHover(null)}
            onMouseEnter={() => onHover(row.key)}
            onMouseLeave={() => onHover(null)}
          />
        );
      })}
    </svg>
  );
}

function RadialSegments({
  colorByKey,
  hoveredKey,
  rows,
  total,
  onHover,
}: {
  colorByKey: Record<string, string>;
  hoveredKey: string | null;
  rows: UsageBreakdownRow[];
  total: number;
  onHover: (key: string | null) => void;
}) {
  return (
    <svg aria-label={`文件夹用量多环分布，总计 ${formatTokens(total)}`} className="size-32 -rotate-90" role="img" viewBox="0 0 128 128">
      {rows.map((row, index) => {
        const radius = 57 - index * 6;
        const circumference = 2 * Math.PI * radius;
        const share = total > 0 ? row.tokens / total : 0;
        const dimmed = hoveredKey != null && hoveredKey !== row.key;
        return (
          <g key={row.key} opacity={dimmed ? 0.25 : 1}>
            <circle cx="64" cy="64" fill="none" r={radius} stroke="#1a2431" strokeWidth="5" />
            <circle
              cx="64"
              cy="64"
              fill="none"
              r={radius}
              stroke={colorByKey[row.key]}
              strokeDasharray={`${circumference * share} ${circumference}`}
              strokeLinecap="butt"
              strokeWidth="5"
              onFocus={() => onHover(row.key)}
              onBlur={() => onHover(null)}
              onMouseEnter={() => onHover(row.key)}
              onMouseLeave={() => onHover(null)}
            />
          </g>
        );
      })}
    </svg>
  );
}

function sectorPath(cx: number, cy: number, radius: number, startDegrees: number, endDegrees: number): string {
  const span = Math.min(359.999, Math.max(0, endDegrees - startDegrees));
  const start = polarPoint(cx, cy, radius, startDegrees);
  const end = polarPoint(cx, cy, radius, startDegrees + span);
  const largeArc = span > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function polarPoint(cx: number, cy: number, radius: number, degrees: number): { x: number; y: number } {
  const radians = (degrees - 90) * Math.PI / 180;
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  };
}
