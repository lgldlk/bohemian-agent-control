import { describe, expect, it } from 'vitest';
import { findPendingTask } from './taskReconciliation';
import type { PendingThread } from '@/workspace/workspaceStore';
import type { Task } from '@/types';

function task(id: string, overrides: Partial<Task> = {}): Task {
  const start = new Date('2024-01-01T00:00:00Z');
  return {
    id,
    name: id,
    fullText: '',
    project: 'p',
    workingDir: '/tmp/p',
    agentKind: 'pi',
    status: 'running',
    model: 'm',
    provider: '',
    progress: -1,
    startTime: start,
    lastActivity: start,
    size: 1,
    messageCount: 0,
    toolCalls: 0,
    tools: [],
    openUrl: '',
    ...overrides,
  };
}

function thread(overrides: Partial<PendingThread> = {}): PendingThread {
  return {
    id: 'pending-1',
    cwd: '/tmp/p',
    createdAt: +new Date('2024-01-01T00:00:00Z'),
    agentKind: 'pi',
    ...overrides,
  };
}

describe('findPendingTask', () => {
  it('matches a task started in the same folder for the same provider', () => {
    const found = findPendingTask(thread(), [task('session-1')]);
    expect(found?.id).toBe('session-1');
  });

  it('refuses a task from a different folder', () => {
    expect(findPendingTask(thread(), [task('session-1', { workingDir: '/tmp/other' })])).toBeUndefined();
  });

  it('refuses a task from a different provider', () => {
    expect(findPendingTask(thread(), [task('session-1', { agentKind: 'codex' })])).toBeUndefined();
  });

  it('refuses a task that started well before the launch', () => {
    const old = task('session-1', { startTime: new Date('2023-12-31T23:00:00Z') });
    expect(findPendingTask(thread(), [old])).toBeUndefined();
  });

  it('ignores deleted tombstones', () => {
    expect(findPendingTask(thread(), [task('session-1', { status: 'deleted' })])).toBeUndefined();
  });

  it('prefers the newest matching task', () => {
    const older = task('session-1', { startTime: new Date('2024-01-01T00:00:05Z') });
    const newer = task('session-2', { startTime: new Date('2024-01-01T00:00:20Z') });
    expect(findPendingTask(thread(), [older, newer])?.id).toBe('session-2');
  });

  it('keeps the board the launch recorded on the thread', () => {
    const pending = thread({ boardId: 'page:a' });
    expect(pending.boardId).toBe('page:a');
  });
});
