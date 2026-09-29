import { useState } from 'react';
import { formatTokenCount } from '@/lib/tokenFormat';

export interface UsageTrendDay {
  key: string;
  label: string;
  tokens: number;
  sessions: number;
}

export function UsageTrendChart({
  days,
  selectedDate,
  dayScoped,
  onSelectDate,
}: {
  days: UsageTrendDay[];
  selectedDate: string | null;
  dayScoped: boolean;
  onSelectDate: (date: string) => void;
}) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hovered = days.find((day) => day.key === hoveredKey) ?? null;
  const maximum = Math.max(1, ...days.map((day) => day.tokens));

  return (
    <section className="px-card mt-4 p-4">
      <div className="mb-4 flex min-h-10 items-start justify-between gap-3">
        <div>
          <h2 className="pixel-font text-[10px] text-zinc-100">{dayScoped ? '当日活跃用量' : '活跃日用量'}</h2>
          <p className="mt-2 text-xs text-zinc-600">点击柱体筛选日期 · 会话累计按最后活跃日归档</p>
        </div>
        {hovered ? (
          <div className="border border-[#294c70] bg-[#101923] px-2 py-1 text-right text-[10px]">
            <div className="text-zinc-500">{hovered.key}</div>
            <div className="mt-0.5 tabular-nums text-[#8fc8fa]">{formatTokenCount(hovered.tokens) ?? '0'} · {hovered.sessions} 会话</div>
          </div>
        ) : null}
      </div>
      <div className="flex h-52 items-end gap-1.5 border-b border-zinc-800 px-1 pb-0">
        {days.map((day) => {
          const selected = selectedDate === day.key;
          return (
            <button
              aria-label={`${day.key}，${formatTokenCount(day.tokens) ?? '0'} Token，${day.sessions} 个会话`}
              aria-pressed={selected}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2 focus-visible:outline-none"
              key={day.key}
              type="button"
              onBlur={() => setHoveredKey(null)}
              onClick={() => onSelectDate(day.key)}
              onFocus={() => setHoveredKey(day.key)}
              onMouseEnter={() => setHoveredKey(day.key)}
              onMouseLeave={() => setHoveredKey(null)}
            >
              <span className="relative w-full" style={{ height: `${day.sessions === 0 ? 2 : Math.max(3, day.tokens / maximum * 170)}px` }}>
                <span className={`block h-full w-full transition-colors ${selected ? 'bg-[#3294ee] ring-1 ring-white' : day.sessions === 0 ? 'bg-zinc-800' : 'bg-zinc-200 group-hover:bg-[#8fc8fa]'}`} />
              </span>
              <span className="mb-2 truncate text-[9px] text-zinc-600">{days.length <= 30 || Number(day.label.split('/')[1]) % 3 === 0 ? day.label : ''}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
