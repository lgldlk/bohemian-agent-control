import { describe, expect, it } from 'vitest';
import { boundSessionId, processStateFromTerminalStatus, terminalIdentityKeys, terminalMatchesIdentity } from './terminalIdentity';

describe('terminal identity', () => {
  const info = { launchId: 'pending-1', nodeId: 'session-a', agentSessionId: 'session-a', status: 'running' };

  it('matches any of the three ids and ignores an empty one', () => {
    expect(terminalMatchesIdentity(info, 'pending-1')).toBe(true);
    expect(terminalMatchesIdentity(info, 'session-a')).toBe(true);
    expect(terminalMatchesIdentity(info, undefined)).toBe(false);
  });

  it('prefers the bound session over the pending launch id', () => {
    expect(boundSessionId(info)).toBe('session-a');
    expect(boundSessionId({ launchId: 'pending-1', nodeId: 'pending-1' })).toBeUndefined();
    expect(terminalIdentityKeys(info)).toEqual(['pending-1', 'session-a', 'session-a']);
  });

  it('maps terminal status onto the process axis input', () => {
    expect(processStateFromTerminalStatus('running')).toBe('running');
    expect(processStateFromTerminalStatus('starting')).toBe('starting');
    expect(processStateFromTerminalStatus('exited')).toBe('exited');
  });
});
