import { describe, expect, it } from 'vitest';
import { resolveBlankBoardDoubleClick } from './boardDoubleClick';

describe('resolveBlankBoardDoubleClick', () => {
  it.each(['text', 'note', 'task-card', 'terminal', 'frame']) (
    'does not treat a %s shape as board whitespace',
    (type) => {
      expect(resolveBlankBoardDoubleClick({ type }, 'group-1')).toBeNull();
    },
  );

  it('keeps empty space inside a group available for adding an Agent', () => {
    expect(resolveBlankBoardDoubleClick(undefined, 'group-1')).toEqual({ groupId: 'group-1' });
  });

  it('recognizes empty space outside groups', () => {
    expect(resolveBlankBoardDoubleClick(undefined, null)).toEqual({});
  });
});
