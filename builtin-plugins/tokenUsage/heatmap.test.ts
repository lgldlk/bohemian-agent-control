import { describe, expect, it } from 'vitest';
import { buildUsageHeatmap, localUtcOffsetLabel } from './heatmap';

describe('buildUsageHeatmap', () => {
  it('builds an 11-month Sunday-aligned grid and aggregates usage by local day', () => {
    const weeks = buildUsageHeatmap([
      { lastActivity: new Date(2026, 8, 28, 9), tokenCount: 100 },
      { lastActivity: new Date(2026, 8, 28, 18), tokenCount: 40 },
      { lastActivity: new Date(2026, 7, 2, 12), tokenCount: 10 },
    ], new Date(2026, 8, 28, 20));

    expect(weeks[0]?.cells[0]?.date.getDay()).toBe(0);
    expect(weeks.some((week) => week.monthLabel === '11月')).toBe(true);
    const september28 = weeks.flatMap((week) => week.cells).find((cell) => cell.key === '2026-09-28');
    expect(september28?.value).toBe(140);
    expect(september28?.level).toBe(4);
    expect(weeks.at(-1)?.cells.some((cell) => cell.future)).toBe(true);
  });

  it('formats the local UTC offset', () => {
    expect(localUtcOffsetLabel(new Date())).toMatch(/^UTC[+-]\d{2}:\d{2}$/);
  });
});
