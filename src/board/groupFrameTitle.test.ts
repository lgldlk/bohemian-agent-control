import { describe, expect, it } from 'vitest';
import { screenSizedFrameTitleTransform } from './groupFrameTitle';

describe('screenSizedFrameTitleTransform', () => {
  it('removes the zoom-out cap so the title stays one screen size', () => {
    expect(screenSizedFrameTitleTransform(
      'scale(min(var(--tl-scale), 3.5)) translateX(-7px)',
    )).toBe('scale(var(--tl-scale)) translateX(-7px)');
  });

  it('keeps the rotation translation in front of the scale', () => {
    expect(screenSizedFrameTitleTransform(
      'translate(480px, 0px) rotate(90deg) scale(min(var(--tl-scale), 3.5)) translateX(-7px)',
    )).toBe('translate(480px, 0px) rotate(90deg) scale(var(--tl-scale)) translateX(-7px)');
  });

  it('leaves an already screen-sized transform unchanged', () => {
    const transform = 'scale(var(--tl-scale)) translateX(-7px)';
    expect(screenSizedFrameTitleTransform(transform)).toBe(transform);
  });
});
