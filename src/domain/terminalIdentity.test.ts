import { describe, expect, it } from 'vitest';
import { boundSessionId } from './terminalIdentity';
import type { TerminalInfo } from '@bohemian/terminal-protocol';

function terminal(overrides: Partial<TerminalInfo>): TerminalInfo {
  return {
    id: 'terminal-1',
    title: 'Terminal',
    cwd: '/tmp/project',
    shell: '/bin/zsh',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
    size: { cols: 80, rows: 24 },
    ...overrides,
  };
}

describe('boundSessionId', () => {
  it('prefers the agent session id', () => {
    expect(boundSessionId(terminal({ nodeId: 'node-1', agentSessionId: 'session-1' }))).toBe('session-1');
  });

  it('refuses to bind a placeholder pending session', () => {
    expect(boundSessionId(terminal({ nodeId: 'pending-1', agentSessionId: 'pending-1' }))).toBeUndefined();
  });

  it('falls back to the node id for a provider without a session id', () => {
    expect(boundSessionId(terminal({ nodeId: 'node-1', launchId: 'pending-1' }))).toBe('node-1');
  });

  it('does not treat the launch id echoed into nodeId as a bound session', () => {
    expect(boundSessionId(terminal({ nodeId: 'pending-1', launchId: 'pending-1' }))).toBeUndefined();
  });

  it('returns undefined when nothing identifies the session', () => {
    expect(boundSessionId(terminal({}))).toBeUndefined();
  });
});
