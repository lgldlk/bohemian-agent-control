import { describe, expect, it } from 'vitest';
import { tokenUsagePlugin } from './plugin';
import { usageColorForKey } from './UsageBreakdownPie';

describe('token usage plugin boundary', () => {
  it('contributes a lazy page without toolbar, topbar, or panel coupling', () => {
    expect(tokenUsagePlugin.pages?.map((page) => page.id)).toEqual(['dashboard']);
    expect(tokenUsagePlugin.toolbar).toBeUndefined();
    expect(tokenUsagePlugin.topbar).toBeUndefined();
    expect(tokenUsagePlugin.panels).toBeUndefined();
  });

  it('keeps category colors stable across sorting and filtering', () => {
    expect(usageColorForKey('gpt-5')).toBe(usageColorForKey('gpt-5'));
    expect(usageColorForKey('gpt-5')).not.toBe(usageColorForKey('claude-sonnet'));
    expect(usageColorForKey('gpt-5')).toMatch(/^hsl\(/);
  });
});
