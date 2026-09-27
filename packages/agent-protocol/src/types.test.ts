import { describe, expect, it } from 'vitest';
import { parseControlTask } from './types';

const validTask = {
  id: 'session-1',
  agentKind: 'pi',
  name: 'Investigate issue',
  fullText: 'Investigate issue',
  project: 'control-center',
  workingDir: '/tmp/control-center',
  status: 'completed',
  model: 'gpt-5',
  provider: 'openai',
  progress: 100,
  startTime: '2026-01-01T00:00:00.000Z',
  lastActivity: '2026-01-01T00:05:00.000Z',
  size: 10,
  messageCount: 3,
  toolCalls: 2,
  tools: ['read'],
  openUrl: '',
};

describe('parseControlTask', () => {
  it('accepts a valid API task and preserves its values', () => {
    expect(parseControlTask(validTask)).toEqual(validTask);
  });

  it('rejects malformed fields instead of trusting the JSON shape', () => {
    expect(() => parseControlTask({ ...validTask, progress: '100' })).toThrow('progress');
    expect(() => parseControlTask({ ...validTask, tools: ['read', 1] })).toThrow('tools');
    expect(() => parseControlTask({ ...validTask, lastActivity: 'not-a-date' })).toThrow('lastActivity');
  });

  it('rejects unknown provider values and non-object payloads', () => {
    expect(() => parseControlTask({ ...validTask, agentKind: 'unknown' })).toThrow('agentKind');
    expect(() => parseControlTask(null)).toThrow('object');
  });
});
