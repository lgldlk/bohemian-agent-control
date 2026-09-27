import { describe, expect, it } from 'vitest';
import { parseAgentCommand, sessionRefMatches } from '@bohemian/agent-protocol';
import { applyLiveStatus, classifyAgentCommand, runningSessionIds, type LiveAgentProcess } from './liveProcesses';

describe('classifyAgentCommand', () => {
  it('maps interactive agent binaries and ignores app-server', () => {
    expect(classifyAgentCommand('pi')).toBe('pi');
    expect(classifyAgentCommand('/usr/local/bin/pi --session abc')).toBe('pi');
    expect(classifyAgentCommand('claude --resume xyz')).toBe('claude-code');
    expect(classifyAgentCommand('codex')).toBe('codex');
    expect(classifyAgentCommand('codex resume abc')).toBe('codex');
    expect(classifyAgentCommand('codex app-server --stdio')).toBeNull();
    expect(classifyAgentCommand('node some-other')).toBeNull();
  });
});

describe('parseAgentCommand', () => {
  it('reads the session id out of resume argv', () => {
    expect(parseAgentCommand(`pi --session '01a08aa3-016d-7320-828d-e855c2a76a04'`)).toEqual({
      kind: 'pi',
      sessionId: '01a08aa3-016d-7320-828d-e855c2a76a04',
    });
    expect(parseAgentCommand('pi --session=/tmp/01a08aa3-016d-7320-828d-e855c2a76a04.jsonl')).toEqual({
      kind: 'pi',
      sessionId: '01a08aa3-016d-7320-828d-e855c2a76a04',
    });
    expect(parseAgentCommand('claude --resume xyz')).toEqual({ kind: 'claude-code', sessionId: 'xyz' });
    expect(parseAgentCommand('codex resume abc')).toEqual({ kind: 'codex', sessionId: 'abc' });
    expect(parseAgentCommand('pi')).toEqual({ kind: 'pi', sessionId: undefined });
  });

  it('matches partial session refs', () => {
    expect(sessionRefMatches('01a08aa3-016d-7320-828d-e855c2a76a04', '01a08aa3')).toBe(true);
    expect(sessionRefMatches('abc', 'zzz')).toBe(false);
  });
});

describe('applyLiveStatus', () => {
  it('marks a session running when a process names its id', () => {
    const live: LiveAgentProcess[] = [
      {
        pid: 11,
        ppid: 1,
        kind: 'pi',
        cwd: '/tmp/other',
        sessionId: '01a08aa3-016d-7320-828d-e855c2a76a04',
        command: "pi --session '01a08aa3-016d-7320-828d-e855c2a76a04'",
      },
    ];
    const sessions = [
      { id: '01a08aa3-016d-7320-828d-e855c2a76a04', agentKind: 'pi' as const, workingDir: '/tmp/app', lastActivity: '2026-01-01T00:00:00.000Z', status: 'completed' as const, progress: 100 },
      { id: 'other', agentKind: 'pi' as const, workingDir: '/tmp/app', lastActivity: '2026-09-01T00:00:00.000Z', status: 'completed' as const, progress: 100 },
    ];
    expect([...runningSessionIds(sessions, live)]).toEqual(['01a08aa3-016d-7320-828d-e855c2a76a04']);
  });

  it('does not mark a session running just because a bare agent lives in the same cwd', () => {
    const live: LiveAgentProcess[] = [
      { pid: 1, ppid: 0, kind: 'pi', cwd: '/tmp/app', command: 'pi' },
    ];
    const sessions = [
      { id: 'newest', agentKind: 'pi' as const, workingDir: '/tmp/app', lastActivity: '2026-09-01T00:00:00.000Z', status: 'completed' as const, progress: 100 },
    ];
    expect([...runningSessionIds(sessions, live)]).toEqual([]);
  });

  it('does not downgrade an already running Codex session', () => {
    const next = applyLiveStatus(
      [{ id: 'a', agentKind: 'codex', workingDir: '/tmp/x', status: 'running', progress: -1 }],
      [],
    );
    expect(next[0]?.status).toBe('running');
  });

  it('drops Pi running when the process is gone', () => {
    const next = applyLiveStatus(
      [{ id: 'a', agentKind: 'pi', workingDir: '/tmp/x', status: 'running', progress: -1 }],
      [],
    );
    expect(next[0]?.status).toBe('completed');
    expect(next[0]?.progress).toBe(100);
  });
});
