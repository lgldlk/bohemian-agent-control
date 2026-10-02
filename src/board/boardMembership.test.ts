import { describe, expect, it } from 'vitest';
import { projectBoardMembership, resolveBoardProjection, UNGROUPED_ID, type BoardCardRef } from './boardMembership';
import type { Task } from '@/types';

function task(id: string): Task {
  const now = new Date(0);
  return {
    id,
    name: id,
    fullText: '',
    project: 'p',
    workingDir: '/tmp/p',
    status: 'completed',
    model: 'm',
    provider: '',
    progress: 100,
    startTime: now,
    lastActivity: now,
    size: 1,
    messageCount: 0,
    toolCalls: 0,
    tools: [],
    openUrl: '',
  };
}

const cards = (...items: Partial<BoardCardRef>[]): BoardCardRef[] => items.map((item, index) => ({
  taskId: item.taskId ?? `task-${index}`,
  groupId: item.groupId ?? UNGROUPED_ID,
  groupName: item.groupName ?? '',
}));

describe('projectBoardMembership', () => {
  it('counts task cards on the canvas, not the API task list', () => {
    const result = projectBoardMembership(
      cards({ taskId: 'a' }, { taskId: 'b' }),
      new Map([['a', task('a')], ['b', task('b')], ['hidden', task('hidden')]]),
      'Ungrouped',
    );
    expect(result.taskIds).toEqual(['a', 'b']);
    expect(result.tasks.map((item) => item.id)).toEqual(['a', 'b']);
    expect(result.has('hidden')).toBe(false);
  });

  it('keeps a missing task id as board membership but excludes it from resolved tasks', () => {
    const result = projectBoardMembership(
      cards({ taskId: 'missing' }, { taskId: 'known' }),
      new Map([['known', task('known')]]),
      'Ungrouped',
    );
    expect(result.taskIds).toEqual(['missing', 'known']);
    expect(result.tasks.map((item) => item.id)).toEqual(['known']);
    expect(result.has('missing')).toBe(true);
  });

  it('deduplicates a card id without inflating the count', () => {
    const result = projectBoardMembership(
      cards({ taskId: 'a' }, { taskId: 'a' }),
      new Map([['a', task('a')]]),
      'Ungrouped',
    );
    expect(result.taskIds).toEqual(['a']);
  });

  it('derives frame groups from card parents', () => {
    const result = projectBoardMembership(
      cards(
        { taskId: 'a', groupId: 'g-a', groupName: 'Project A' },
        { taskId: 'b', groupId: 'g-a', groupName: 'Project A' },
        { taskId: 'c' },
      ),
      new Map([['a', task('a')], ['b', task('b')], ['c', task('c')]]),
      'Ungrouped',
    );
    expect(result.groups).toEqual([
      { id: UNGROUPED_ID, name: 'Ungrouped', taskIds: ['c'], collapsed: false },
      { id: 'g-a', name: 'Project A', taskIds: ['a', 'b'], collapsed: false },
    ]);
  });

  it('returns zero for an empty canvas even when the API has tasks', () => {
    const result = projectBoardMembership([], new Map([['a', task('a')]]), 'Ungrouped');
    expect(result.taskIds).toEqual([]);
    expect(result.tasks).toEqual([]);
    expect(result.groups[0].taskIds).toEqual([]);
  });

  it('hydrates an empty legacy page from saved memberships once', () => {
    const canvas = projectBoardMembership([], new Map([['a', task('a')]]), 'Ungrouped');
    const legacy = [{
      id: 'default', name: 'Ungrouped', taskIds: ['a', 'b'], collapsed: false,
    }];
    expect(resolveBoardProjection(canvas, legacy)).toEqual({
      groups: legacy,
      taskIds: ['a', 'b'],
      needsLegacyHydration: true,
    });
  });

  it('prefers canvas membership over stale legacy membership', () => {
    const canvas = projectBoardMembership(
      cards({ taskId: 'canvas-a' }),
      new Map([['canvas-a', task('canvas-a')]]),
      'Ungrouped',
    );
    const legacy = [{ id: 'default', name: 'Ungrouped', taskIds: ['legacy-a'], collapsed: false }];
    expect(resolveBoardProjection(canvas, legacy)).toMatchObject({
      taskIds: ['canvas-a'],
      needsLegacyHydration: false,
    });
  });

  it('does not invent membership when both canvas and legacy data are empty', () => {
    const canvas = projectBoardMembership([], new Map([['api-only', task('api-only')]]), 'Ungrouped');
    expect(resolveBoardProjection(canvas, [])).toMatchObject({
      taskIds: [],
      needsLegacyHydration: false,
    });
  });
});
