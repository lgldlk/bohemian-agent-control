import { describe, expect, it } from 'vitest';
import { defaultResourceShapeSize, shouldExpandLegacyResourceShape } from './resourceLayout';

describe('resource preview layout', () => {
  it('uses readable defaults for interactive resources', () => {
    expect(defaultResourceShapeSize({ kind: 'remote-url' })).toEqual({ w: 1100, h: 720 });
    expect(defaultResourceShapeSize({ kind: 'local-file', previewKind: 'text' })).toEqual({ w: 900, h: 620 });
    expect(defaultResourceShapeSize({ kind: 'local-file', previewKind: 'video' })).toEqual({ w: 1000, h: 680 });
    expect(defaultResourceShapeSize({ kind: 'local-file', previewKind: 'audio' })).toEqual({ w: 720, h: 300 });
  });

  it('expands legacy defaults without overriding already-large custom nodes', () => {
    expect(shouldExpandLegacyResourceShape({ kind: 'remote-url', previewKind: 'link', w: 400, h: 220 })).toBe(true);
    expect(shouldExpandLegacyResourceShape({ kind: 'local-file', previewKind: 'text', w: 640, h: 400 })).toBe(true);
    expect(shouldExpandLegacyResourceShape({ kind: 'local-file', previewKind: 'text', w: 1200, h: 800 })).toBe(false);
  });
});
