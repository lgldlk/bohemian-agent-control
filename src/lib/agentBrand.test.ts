import { describe, expect, it } from 'vitest';
import { showsMessageCount } from './agentBrand';

describe('showsMessageCount', () => {
  it('hides Codex and Claude Code counts that the adapters cannot provide', () => {
    expect(showsMessageCount('codex')).toBe(false);
    expect(showsMessageCount('claude-code')).toBe(false);
    expect(showsMessageCount('claude')).toBe(false);
    expect(showsMessageCount('pi')).toBe(true);
    expect(showsMessageCount(undefined)).toBe(true);
  });
});
