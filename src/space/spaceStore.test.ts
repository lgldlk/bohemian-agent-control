import { describe, expect, it } from 'vitest';
import { normalizePersistedGroups, type SpaceGroup } from './spaceStore';

const group = (id: string, taskIds: string[]): SpaceGroup => ({
  id,
  name: id,
  taskIds,
  collapsed: false,
});

describe('normalizePersistedGroups', () => {
  it('removes native frame groups and recovers their tasks into ungrouped', () => {
    expect(normalizePersistedGroups([
      group('default', ['existing']),
      group('shape:native-frame', ['agent-a', 'agent-b']),
      group('g-project', ['agent-c']),
    ])).toEqual([
      group('default', ['existing', 'agent-a', 'agent-b']),
      group('g-project', ['agent-c']),
    ]);
  });

  it('does not duplicate a task already owned by a real business group', () => {
    expect(normalizePersistedGroups([
      group('shape:native-frame', ['agent-a']),
      group('g-project', ['agent-a']),
    ])).toEqual([
      { id: 'default', name: '未分组', taskIds: [], collapsed: false },
      group('g-project', ['agent-a']),
    ]);
  });

  it('leaves valid business groups unchanged', () => {
    const groups = [group('default', []), group('g-project', ['agent-a'])];
    expect(normalizePersistedGroups(groups)).toBe(groups);
  });
});
