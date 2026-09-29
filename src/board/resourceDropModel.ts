import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import { defaultResourceShapeSize } from './resourceLayout';

export async function mapSettledWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = { status: 'fulfilled', value: await task(items[index], index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, worker));
  return results;
}

export function resourceDropPositions(
  resources: readonly TerminalResourceRef[],
  point: { x: number; y: number },
  columns = 2,
  gap = 48,
): Array<{ x: number; y: number }> {
  if (resources.length === 0) return [];
  const count = Math.max(1, Math.min(columns, resources.length));
  const sizes = resources.map((resource) => defaultResourceShapeSize(resource));
  const columnWidths = Array.from({ length: count }, (_, column) => Math.max(
    ...sizes.filter((_size, index) => index % count === column).map((size) => size.w),
  ));
  const rowCount = Math.ceil(resources.length / count);
  const rowHeights = Array.from({ length: rowCount }, (_, row) => Math.max(
    ...sizes.slice(row * count, row * count + count).map((size) => size.h),
  ));
  const totalWidth = columnWidths.reduce((sum, width) => sum + width, 0) + gap * (count - 1);
  const totalHeight = rowHeights.reduce((sum, height) => sum + height, 0) + gap * (rowCount - 1);
  const columnX: number[] = [];
  const rowY: number[] = [];
  let x = point.x - totalWidth / 2;
  for (const width of columnWidths) {
    columnX.push(x);
    x += width + gap;
  }
  let y = point.y - totalHeight / 2;
  for (const height of rowHeights) {
    rowY.push(y);
    y += height + gap;
  }
  return resources.map((_resource, index) => ({
    x: columnX[index % count],
    y: rowY[Math.floor(index / count)],
  }));
}
