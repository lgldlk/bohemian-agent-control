import { describe, expect, it } from 'vitest';
import { placeLikeBoard } from './boardPlacement';

describe('placeLikeBoard', () => {
  const anchor = { x: 136, y: 168, w: 320, h: 112 };

  it('places a terminal below the card, centered, same as the free board', () => {
    expect(placeLikeBoard({
      anchor,
      width: 720,
      height: 440,
      beside: true,
      direction: 'vertical',
    })).toEqual({ x: 136 + (320 - 720) / 2, y: 168 + 112 + 48 });
  });

  it('places a horizontal split to the right, top aligned', () => {
    expect(placeLikeBoard({
      anchor,
      width: 720,
      height: 440,
      beside: true,
      direction: 'horizontal',
    })).toEqual({ x: 136 + 320 + 48, y: 168 });
  });

  it('centers a free shape in the anchor when nothing is beside it', () => {
    expect(placeLikeBoard({
      anchor,
      width: 720,
      height: 440,
      beside: false,
      direction: 'horizontal',
    })).toEqual({ x: 136 + (320 - 720) / 2, y: 168 + (112 - 440) / 2 });
  });
});
