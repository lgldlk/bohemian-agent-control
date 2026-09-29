import { describe, expect, it } from 'vitest';
import { classifyBoardContext } from './boardContextMenuModel';

describe('board context menu governance', () => {
  it('classifies empty canvas and homogeneous business selections', () => {
    expect(classifyBoardContext([])).toBe('canvas');
    expect(classifyBoardContext([{ type: 'task-card' }, { type: 'task-card' }])).toBe('tasks');
    expect(classifyBoardContext([{ type: 'terminal' }])).toBe('terminal');
    expect(classifyBoardContext([{ type: 'frame', meta: { groupId: 'group-a' } }])).toBe('group');
    expect(classifyBoardContext([{ type: 'arrow', meta: { role: 'node-link' } }])).toBe('system-link');
  });

  it('keeps ordinary whiteboard shapes in the curated free-shape menu', () => {
    expect(classifyBoardContext([{ type: 'text' }, { type: 'note' }])).toBe('free-shapes');
    expect(classifyBoardContext([{ type: 'frame', meta: {} }])).toBe('free-shapes');
    expect(classifyBoardContext([{ type: 'arrow', meta: {} }])).toBe('free-shapes');
  });

  it('classifies mixed business selections conservatively', () => {
    expect(classifyBoardContext([{ type: 'task-card' }, { type: 'note' }])).toBe('mixed');
    expect(classifyBoardContext([{ type: 'terminal' }, { type: 'terminal' }])).toBe('mixed');
    expect(classifyBoardContext([
      { type: 'frame', meta: { groupId: 'group-a' } },
      { type: 'task-card' },
    ])).toBe('mixed');
  });
});
