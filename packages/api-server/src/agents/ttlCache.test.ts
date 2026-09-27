import { describe, expect, it } from 'vitest';
import { createTtlCache } from './ttlCache';

describe('createTtlCache', () => {
  it('reuses an in-flight promise', async () => {
    const cache = createTtlCache<number>(10_000);
    let calls = 0;
    const load = () => {
      calls += 1;
      return Promise.resolve(calls);
    };
    const [a, b] = await Promise.all([cache.get(load), cache.get(load)]);
    expect(a).toBe(1);
    expect(b).toBe(1);
    expect(calls).toBe(1);
  });
});
