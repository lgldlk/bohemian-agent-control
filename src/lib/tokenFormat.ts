export function formatTokenCount(value?: number): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  if (value < 1_000) return String(Math.round(value));
  if (value < 1_000_000) return `${trimDecimal(value / 1_000)}k`;
  if (value < 1_000_000_000) return `${trimDecimal(value / 1_000_000)}M`;
  return `${trimDecimal(value / 1_000_000_000)}B`;
}

function trimDecimal(value: number): string {
  return value >= 100 ? value.toFixed(0) : value.toFixed(1).replace(/\.0$/, '');
}
