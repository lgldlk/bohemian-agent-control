import { describe, expect, it } from 'vitest';
import { applySessionIdentity, providerStatusSessionAction } from './sessionIdentity';

describe('providerStatusSessionAction', () => {
  it('adopts explicit Claude/Codex session transitions', () => {
    expect(providerStatusSessionAction('session-a', {
      providerSessionId: 'session-b',
      sessionTransition: true,
    })).toBe('adopt');
  });

  it('rejects late status events from the previous topic', () => {
    expect(providerStatusSessionAction('session-b', {
      providerSessionId: 'session-a',
    })).toBe('stale');
  });

  it('keeps same-session compaction events on the current topic', () => {
    expect(providerStatusSessionAction('session-a', {
      providerSessionId: 'session-a',
    })).toBe('current');
  });
});

describe('applySessionIdentity', () => {
  it('replaces a pending launch identity with the first provider session', () => {
    const info = {
      launchId: 'pending-1',
      nodeId: 'pending-1',
      agentSessionId: undefined as string | undefined,
    };

    expect(applySessionIdentity(info, 'session-a', false)).toEqual({
      changed: true,
      sessionChanged: true,
    });
    expect(info).toEqual({
      launchId: 'pending-1',
      nodeId: 'session-a',
      agentSessionId: 'session-a',
    });
  });

  it('moves the terminal node when /new or /resume changes the active session', () => {
    const info = {
      launchId: 'pending-1',
      nodeId: 'session-a',
      agentSessionId: 'session-a',
    };

    expect(applySessionIdentity(info, 'session-b', true)).toEqual({
      changed: true,
      sessionChanged: true,
    });
    expect(info.nodeId).toBe('session-b');
    expect(info.agentSessionId).toBe('session-b');
  });

  it('ignores pending or empty provider identities', () => {
    const info = { launchId: 'pending-1', nodeId: 'session-a', agentSessionId: 'session-a' };

    expect(applySessionIdentity(info, ' pending-next ', true).changed).toBe(false);
    expect(applySessionIdentity(info, ' ', true).changed).toBe(false);
    expect(info.nodeId).toBe('session-a');
  });
});
