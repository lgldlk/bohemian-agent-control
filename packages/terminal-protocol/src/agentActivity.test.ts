import { describe, expect, it } from 'vitest';
import { createOscTitleParser, detectAgentActivity, foldAgentActivity } from './agentActivity';

describe('detectAgentActivity', () => {
  it('reads Pi braille spinner as working and π idle as idle', () => {
    expect(detectAgentActivity('⠋ π - session - /tmp')).toBe('working');
    expect(detectAgentActivity('π - session - /tmp')).toBe('idle');
    expect(detectAgentActivity('π ! needs approval')).toBe('blocked');
  });

  it('reads Claude quarter-circle busy titles and idle star', () => {
    expect(detectAgentActivity('◐ claude')).toBe('working');
    expect(detectAgentActivity('✳ claude')).toBe('idle');
  });

  it('ignores ordinary shell titles', () => {
    expect(detectAgentActivity('zsh')).toBeNull();
    expect(detectAgentActivity('user@host:~/work')).toBeNull();
  });
});

describe('foldAgentActivity', () => {
  it('drops working to idle when the title becomes a plain shell', () => {
    expect(foldAgentActivity('working', null)).toBe('idle');
    expect(foldAgentActivity('idle', null)).toBe('idle');
  });
});

describe('createOscTitleParser', () => {
  it('parses BEL and ST terminated titles across chunks', () => {
    const parse = createOscTitleParser();
    expect(parse('\x1b]0;Pi ready\x07')).toEqual(['Pi ready']);
    expect(parse('\x1b]2;partial')).toEqual([]);
    expect(parse(' title\x1b\\')).toEqual(['partial title']);
  });
});
