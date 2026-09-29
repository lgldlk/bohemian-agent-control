import { useEffect, useState, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { formatTokenCount } from '@/lib/tokenFormat';
import { localUtcOffsetLabel, type UsageHeatmapCell, type UsageHeatmapWeek } from './heatmap';

const HEATMAP_COLORS = ['#132033', '#17365f', '#16558f', '#1d75c8', '#3294ee'] as const;

interface TooltipAnchor {
  cell: UsageHeatmapCell;
  left: number;
  top: number;
  bottom: number;
}

export function UsageHeatmapChart({
  weeks,
  now,
  selectedDate,
  onSelectDate,
}: {
  weeks: UsageHeatmapWeek[];
  now: Date;
  selectedDate: string | null;
  onSelectDate: (date: string) => void;
}) {
  const [tooltip, setTooltip] = useState<TooltipAnchor | null>(null);
  const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const columns = `repeat(${weeks.length}, minmax(14px, 1fr))`;

  useEffect(() => {
    if (!tooltip) return;
    const hide = () => setTooltip(null);
    window.addEventListener('scroll', hide, { capture: true, passive: true });
    return () => window.removeEventListener('scroll', hide, { capture: true });
  }, [tooltip]);

  const showTooltip = (cell: UsageHeatmapCell, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    setTooltip({
      cell,
      left: rect.left + rect.width / 2,
      top: rect.top,
      bottom: rect.bottom,
    });
  };

  return (
    <section className="px-card mt-4 p-4">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="pixel-font text-[10px] text-zinc-100">用量热力图</h2>
          <p className="mt-2 text-xs text-zinc-600">点击日期筛选整页 · 过去 11 个月 · 按最后活跃日归档</p>
        </div>
        {selectedDate ? <span className="px-badge bg-[#17365f] px-2 py-1 text-[7px] text-[#b9ddff]">DATE FILTER</span> : null}
      </div>
      <div className="usage-scrollbar overflow-x-auto pb-1">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-[24px_1fr] gap-x-2">
            <div />
            <div className="grid h-5 gap-[3px]" style={{ gridTemplateColumns: columns }}>
              {weeks.map((week) => <span key={week.key} className="whitespace-nowrap text-[10px] text-zinc-500">{week.monthLabel}</span>)}
            </div>
            <div className="grid grid-rows-7 gap-[3px] text-[10px] leading-[14px] text-zinc-500">
              {dayLabels.map((label) => <span key={label}>{label}</span>)}
            </div>
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: columns }}>
              {weeks.map((week) => (
                <div key={week.key} className="grid grid-rows-7 gap-[3px]">
                  {week.cells.map((cell) => cell.future ? (
                    <span className="aspect-square min-h-[14px]" key={cell.key} />
                  ) : (
                    <button
                      aria-label={`${cell.key}，${formatTokenCount(cell.value) ?? '0'} Token`}
                      aria-pressed={selectedDate === cell.key}
                      className={`aspect-square min-h-[14px] rounded-[3px] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#8fc8fa] ${selectedDate === cell.key ? 'ring-2 ring-white' : ''}`}
                      key={cell.key}
                      style={{ backgroundColor: HEATMAP_COLORS[cell.level] }}
                      type="button"
                      onBlur={() => setTooltip(null)}
                      onClick={() => onSelectDate(cell.key)}
                      onFocus={(event: FocusEvent<HTMLButtonElement>) => showTooltip(cell, event.currentTarget)}
                      onMouseEnter={(event: MouseEvent<HTMLButtonElement>) => showTooltip(cell, event.currentTarget)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-4 pl-8 text-[10px] text-zinc-500">
            <span>{localUtcOffsetLabel(now)}</span>
            <div className="flex items-center gap-1.5">
              <span>少</span>
              {HEATMAP_COLORS.map((color) => <i key={color} className="size-3 rounded-[3px]" style={{ backgroundColor: color }} />)}
              <span>多</span>
            </div>
          </div>
        </div>
      </div>
      {tooltip && typeof document !== 'undefined' ? createPortal(
        <div
          className="pointer-events-none fixed z-[200000] min-w-44 -translate-x-1/2 border border-[#294c70] bg-[#0b1119]/98 px-3 py-2 text-xs text-zinc-200 shadow-2xl"
          role="tooltip"
          style={{
            left: Math.min(Math.max(tooltip.left, 96), window.innerWidth - 96),
            top: tooltip.top < 120 ? tooltip.bottom + 8 : tooltip.top - 8,
            transform: tooltip.top < 120 ? 'translateX(-50%)' : 'translate(-50%, -100%)',
          }}
        >
          <div className="font-medium">{tooltip.cell.date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}</div>
          <div className="mt-1 flex items-center justify-between gap-5 text-zinc-500">
            <span>会话累计</span>
            <span className="font-semibold tabular-nums text-[#8fc8fa]">{formatTokenCount(tooltip.cell.value) ?? '0'}</span>
          </div>
        </div>,
        document.body,
      ) : null}
    </section>
  );
}
