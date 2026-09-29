import { describe, expect, it } from 'vitest';
import { mapSettledWithConcurrency, resourceDropPositions } from './resourceDropModel';

describe('resource drop model', () => {
  it('limits concurrent imports while preserving result order', async () => {
    let active = 0;
    let maximum = 0;
    const results = await mapSettledWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(maximum).toBeLessThanOrEqual(2);
    expect(results.map((result) => result.status === 'fulfilled' ? result.value : null))
      .toEqual([2, 4, 6, 8, 10]);
  });

  it('lays out mixed resource sizes without overlapping columns', () => {
    const resources = [
      { kind: 'remote-url' as const, raw: '', displayText: '', cwd: '', line: null, column: null },
      { kind: 'local-file' as const, raw: '', displayText: '', cwd: '', line: null, column: null, previewKind: 'audio' },
      { kind: 'local-file' as const, raw: '', displayText: '', cwd: '', line: null, column: null, previewKind: 'text' },
    ];
    const positions = resourceDropPositions(resources, { x: 1000, y: 800 });
    expect(positions).toHaveLength(3);
    expect(positions[1].x).toBeGreaterThan(positions[0].x + 1100);
    expect(positions[2].y).toBeGreaterThan(positions[0].y + 720);
  });
});
