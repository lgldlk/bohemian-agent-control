import { describe, expect, it } from 'vitest';
import { correctedClientPoint, scaleForBox } from './terminalPointer';

describe('terminal pointer correction', () => {
  it('maps a zoomed click back onto the unscaled cell grid', () => {
    const box = {
      rectLeft: 100,
      rectTop: 200,
      rectWidth: 200,
      rectHeight: 100,
      offsetWidth: 400,
      offsetHeight: 200,
    };
    expect(scaleForBox(box)).toEqual({ x: 2, y: 2 });
    expect(correctedClientPoint(box, 150, 250)).toEqual({ x: 200, y: 300 });
  });

  it('leaves an unscaled terminal unchanged', () => {
    const box = {
      rectLeft: 10,
      rectTop: 20,
      rectWidth: 400,
      rectHeight: 200,
      offsetWidth: 400,
      offsetHeight: 200,
    };
    expect(correctedClientPoint(box, 30, 50)).toEqual({ x: 30, y: 50 });
  });
});
