import { describe, expect, it } from 'vitest';
import { formatSessionCopy, sessionFromShape } from './copySession';

describe('sessionFromShape', () => {
  it('reads the task-card session id and agent', () => {
    expect(
      sessionFromShape({
        type: 'task-card',
        props: { taskId: 'sess-pi', agentKind: 'pi' },
      }),
    ).toEqual({ id: 'sess-pi', agentKind: 'pi' });
  });

  it('reads a terminal node as the bound session', () => {
    expect(
      sessionFromShape({
        type: 'terminal',
        props: { nodeId: 'sess-claude', terminalId: 'term-1' },
      }),
    ).toEqual({ id: 'sess-claude', agentKind: '' });
  });

  it('ignores free terminals and unrelated shapes', () => {
    expect(sessionFromShape({ type: 'terminal', props: { nodeId: '', terminalId: 'term-1' } })).toBeNull();
    expect(sessionFromShape({ type: 'frame', props: { name: 'Group' } })).toBeNull();
  });
});

describe('formatSessionCopy', () => {
  it('copies the resume command for the selected agent session', () => {
    expect(formatSessionCopy([{ id: 'abc def', agentKind: 'pi' }])).toBe(`pi --session 'abc def'`);
    expect(formatSessionCopy([{ id: 'c1', agentKind: 'claude-code' }])).toBe(`claude --resume 'c1'`);
    expect(formatSessionCopy([{ id: 'x', agentKind: 'codex' }])).toBe(`codex resume 'x'`);
  });

  it('falls back to the raw id when the agent is unknown', () => {
    expect(formatSessionCopy([{ id: 'orphan', agentKind: '' }])).toBe('orphan');
  });

  it('copies one command per unique selected session', () => {
    expect(
      formatSessionCopy([
        { id: 'a', agentKind: 'pi' },
        { id: 'b', agentKind: 'codex' },
      ]),
    ).toBe(`pi --session 'a'\ncodex resume 'b'`);
  });
});
