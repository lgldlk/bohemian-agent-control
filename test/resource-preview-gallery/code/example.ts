export interface ResourceRange {
  startLine: number;
  endLine?: number;
  startColumn?: number;
  endColumn?: number;
}

export function formatRange(range: ResourceRange): string {
  const start = `${range.startLine}${range.startColumn ? `:${range.startColumn}` : ''}`;
  if (!range.endLine || range.endLine <= range.startLine) return `L${start}`;
  const end = `${range.endLine}${range.endColumn ? `:${range.endColumn}` : ''}`;
  return `L${start}–${end}`;
}

console.log(formatRange({ startLine: 12, endLine: 26 }));
