export interface UsageHeatmapInput {
  lastActivity: Date;
  tokenCount?: number;
}

export interface UsageHeatmapCell {
  key: string;
  date: Date;
  value: number;
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
}

export interface UsageHeatmapWeek {
  key: string;
  cells: UsageHeatmapCell[];
  monthLabel: string;
}

function localDayKey(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfDay(value: Date): Date {
  const result = new Date(value);
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(value: Date, amount: number): Date {
  const result = new Date(value);
  result.setDate(result.getDate() + amount);
  return result;
}

function calendarDayNumber(value: Date): number {
  return Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000;
}

function usageLevel(value: number, maximum: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || maximum <= 0) return 0;
  return Math.max(1, Math.min(4, Math.ceil(Math.log1p(value) / Math.log1p(maximum) * 4))) as 1 | 2 | 3 | 4;
}

/** Build an 11-month, Sunday-aligned local-time activity grid. */
export function buildUsageHeatmap(rows: readonly UsageHeatmapInput[], now: Date): UsageHeatmapWeek[] {
  const today = startOfDay(now);
  const firstMonth = new Date(today.getFullYear(), today.getMonth() - 10, 1);
  const start = addDays(firstMonth, -firstMonth.getDay());
  const dayCount = calendarDayNumber(today) - calendarDayNumber(start) + 1;
  const weekCount = Math.ceil(dayCount / 7);
  const values = new Map<string, number>();

  for (const row of rows) {
    if (!(row.lastActivity instanceof Date) || Number.isNaN(row.lastActivity.getTime())) continue;
    if (typeof row.tokenCount !== 'number' || !Number.isFinite(row.tokenCount) || row.tokenCount < 0) continue;
    const key = localDayKey(row.lastActivity);
    values.set(key, (values.get(key) ?? 0) + row.tokenCount);
  }

  const maximum = Math.max(0, ...values.values());
  let lastMonth = -1;
  return Array.from({ length: weekCount }, (_, weekIndex) => {
    const cells = Array.from({ length: 7 }, (_, dayIndex) => {
      const date = addDays(start, weekIndex * 7 + dayIndex);
      const future = date.getTime() > today.getTime();
      const value = future ? 0 : values.get(localDayKey(date)) ?? 0;
      return {
        key: localDayKey(date),
        date,
        value,
        level: usageLevel(value, maximum),
        future,
      } satisfies UsageHeatmapCell;
    });
    const monthStart = cells.find((cell) => !cell.future && cell.date.getDate() <= 7);
    const month = monthStart?.date.getMonth() ?? -1;
    const monthLabel = month >= 0 && month !== lastMonth ? `${month + 1}月` : '';
    if (monthLabel) lastMonth = month;
    return { key: cells[0]!.key, cells, monthLabel };
  });
}

export function localUtcOffsetLabel(value: Date): string {
  const offsetMinutes = -value.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, '0');
  const minutes = String(absolute % 60).padStart(2, '0');
  return `UTC${sign}${hours}:${minutes}`;
}
