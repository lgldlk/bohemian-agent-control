import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocalJson, writeLocalJson } from './localJson';

afterEach(() => vi.unstubAllGlobals());

describe('local JSON storage', () => {
  it('decodes valid values and rejects invalid shapes', () => {
    vi.stubGlobal('localStorage', { getItem: () => '["a"]' });
    const decode = (value: unknown) => Array.isArray(value) && value.every((x) => typeof x === 'string')
      ? value as string[] : null;
    expect(readLocalJson('key', decode, () => [])).toEqual(['a']);
    expect(readLocalJson('key', () => null, () => ['fallback'])).toEqual(['fallback']);
  });

  it('falls back on malformed JSON or inaccessible storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{' });
    expect(readLocalJson('key', () => true, () => false)).toBe(false);
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(readLocalJson('key', () => true, () => false)).toBe(false);
  });

  it('does not interrupt updates if storage rejects a write', () => {
    const setItem = vi.fn(() => { throw new Error('quota'); });
    vi.stubGlobal('localStorage', { setItem });
    expect(() => writeLocalJson('key', { value: 1 })).not.toThrow();
    expect(setItem).toHaveBeenCalledOnce();
  });
});
