import { describe, expect, it } from 'vitest';
import { groupIdAtPoint, groupIdOfFrame, isBusinessGroupFrame } from './boardShapes';

describe('business group frames', () => {
  it('requires an explicit business groupId', () => {
    const nativeFrame = { type: 'frame', meta: {} };
    const businessFrame = { type: 'frame', meta: { groupId: 'g-project' } };
    expect(groupIdOfFrame(nativeFrame)).toBeNull();
    expect(isBusinessGroupFrame(nativeFrame)).toBe(false);
    expect(groupIdOfFrame(businessFrame)).toBe('g-project');
    expect(isBusinessGroupFrame(businessFrame)).toBe(true);
  });
});

describe('groupIdAtPoint', () => {
  const back = { groupId: 'back', x: 0, y: 0, w: 900, h: 600 };
  const front = { groupId: 'front', x: 700, y: 100, w: 400, h: 300 };

  it('finds a group when the click lands in the empty interior', () => {
    expect(groupIdAtPoint([front, back], { x: 200, y: 200 })).toBe('back');
  });

  it('prefers the front group when frames overlap', () => {
    expect(groupIdAtPoint([front, back], { x: 720, y: 150 })).toBe('front');
  });

  it('returns null outside every group', () => {
    expect(groupIdAtPoint([front, back], { x: 1200, y: 800 })).toBeNull();
  });
});
