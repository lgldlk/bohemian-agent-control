import { describe, expect, it } from 'vitest';
import { createAgentStatusParser } from './agentStatus';

describe('createAgentStatusParser', () => {
  it('removes a complete OSC status frame from terminal output', () => {
    const parse = createAgentStatusParser();
    expect(parse('before\x1b]9999;{"state":"working","prompt":"ship it"}\x07after')).toEqual({
      cleanData: 'beforeafter',
      payloads: [{ state: 'working', prompt: 'ship it' }],
    });
  });

  it('keeps split markers and payloads across chunks', () => {
    const parse = createAgentStatusParser();
    expect(parse('before\x1b]999')).toEqual({ cleanData: 'before', payloads: [] });
    expect(parse('9;{"state":"waiting","agentType":"codex"}\x1b\\after')).toEqual({
      cleanData: 'after',
      payloads: [{ state: 'waiting', agentType: 'codex' }],
    });
  });

  it('ignores malformed and unsupported payloads while preserving visible text', () => {
    const parse = createAgentStatusParser();
    expect(parse('x\x1b]9999;{"state":"unknown"}\x07y')).toEqual({
      cleanData: 'xy',
      payloads: [],
    });
  });
});
