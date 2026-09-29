import { describe, expect, it } from 'vitest';
import {
  buildAgentNavigatorGroups,
  countAgentNavigatorFilters,
  type AgentNavigatorEntry,
} from './agentQuickNavigatorModel';

function entry(overrides: Partial<AgentNavigatorEntry>): AgentNavigatorEntry {
  return {
    taskId: 'task',
    shapeId: 'shape:task',
    groupId: 'group-a',
    groupName: 'Project A',
    groupX: 0,
    groupY: 0,
    x: 0,
    y: 0,
    name: 'Agent task',
    project: 'app',
    workingDir: '/repo/app',
    model: 'model',
    agentKind: 'pi',
    status: 'idle',
    ...overrides,
  };
}

describe('agent quick navigator model', () => {
  it('groups by frame, sorts by canvas order, and leaves ungrouped last', () => {
    const groups = buildAgentNavigatorGroups([
      entry({ taskId: 'loose', shapeId: 'shape:loose', groupId: 'ungrouped', groupName: 'Ungrouped', x: 0, y: 0 }),
      entry({ taskId: 'later', shapeId: 'shape:later', groupId: 'group-b', groupName: 'Project B', groupX: 0, groupY: 500 }),
      entry({ taskId: 'second', shapeId: 'shape:second', x: 400, y: 20 }),
      entry({ taskId: 'first', shapeId: 'shape:first', x: 20, y: 20 }),
    ], '', 'all');

    expect(groups.map((group) => group.id)).toEqual(['group-a', 'group-b', 'ungrouped']);
    expect(groups[0].entries.map((item) => item.taskId)).toEqual(['first', 'second']);
  });

  it('searches Agent, project, model, path, kind, and group text', () => {
    const rows = [
      entry({ taskId: 'pi', name: 'Fix terminal', model: 'gpt-5', agentKind: 'pi' }),
      entry({ taskId: 'claude', name: 'Review API', project: 'server', workingDir: '/repo/server', model: 'opus', agentKind: 'claude-code' }),
    ];

    expect(buildAgentNavigatorGroups(rows, 'opus', 'all')[0].entries[0].taskId).toBe('claude');
    expect(buildAgentNavigatorGroups(rows, '/repo/app', 'all')[0].entries[0].taskId).toBe('pi');
    expect(buildAgentNavigatorGroups(rows, 'missing', 'all')).toEqual([]);
  });

  it('filters active and attention states and reports counts', () => {
    const rows = [
      entry({ taskId: 'running', status: 'running' }),
      entry({ taskId: 'idle', status: 'idle' }),
      entry({ taskId: 'blocked', status: 'blocked' }),
      entry({ taskId: 'done', status: 'completed' }),
      entry({ taskId: 'error', status: 'error' }),
    ];

    expect(countAgentNavigatorFilters(rows)).toEqual({ all: 5, active: 2, attention: 2 });
    expect(buildAgentNavigatorGroups(rows, '', 'active')[0].entries.map((item) => item.taskId)).toEqual(['idle', 'running']);
    expect(buildAgentNavigatorGroups(rows, '', 'attention')[0].entries.map((item) => item.taskId)).toEqual(['blocked', 'error']);
  });
});
