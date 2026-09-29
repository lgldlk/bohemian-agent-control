import { describe, expect, it } from 'vitest';
import { placeLikeBoard } from './boardPlacement';
import {
  FRAME_DEFAULT_H,
  FRAME_DEFAULT_W,
  FRAME_GROW_STEP,
  FRAME_PAD,
  FRAME_TITLE,
  frameCanAbsorb,
  planFrameExpansion,
} from './groupFrame';

const frame = { x: 100, y: 80, w: 480, h: 280 };

describe('default group frame', () => {
  it('fits two cards with room to place another before the edge', () => {
    expect(FRAME_DEFAULT_W).toBeGreaterThanOrEqual(FRAME_PAD + 336 + 320 + FRAME_PAD + 120);
    expect(FRAME_DEFAULT_H).toBeGreaterThanOrEqual(FRAME_TITLE + FRAME_PAD + 112 + 132 + FRAME_PAD + 120);
  });
});

describe('planFrameExpansion', () => {
  it('does nothing when content already sits inside the padding', () => {
    expect(planFrameExpansion(frame, [{ x: FRAME_PAD, y: FRAME_TITLE + FRAME_PAD, w: 320, h: 112 }])).toBeNull();
  });

  it('grows right and down without moving the agent on the page', () => {
    const agent = { x: 36, y: 68, w: 460, h: 200 };
    const plan = planFrameExpansion(frame, [agent]);
    expect(plan).toMatchObject({
      childDx: 0,
      childDy: 0,
      contained: true,
      frame: { x: frame.x, y: frame.y, w: 36 + 460 + FRAME_PAD, h: 68 + 200 + FRAME_PAD },
    });
    expect(plan!.frame.x + agent.x + plan!.childDx).toBe(frame.x + agent.x);
    expect(plan!.frame.y + agent.y + plan!.childDy).toBe(frame.y + agent.y);
  });

  it('moves the frame, not the agent, when content crosses the left or title', () => {
    const agent = { x: 10, y: 40, w: 320, h: 112 };
    const plan = planFrameExpansion(frame, [agent]);
    expect(plan).toMatchObject({ childDx: 26, childDy: 28, contained: true });
    expect(plan!.frame.x + agent.x + plan!.childDx).toBe(frame.x + agent.x);
    expect(plan!.frame.y + agent.y + plan!.childDy).toBe(frame.y + agent.y);
  });

  it('grows just enough to contain a new terminal without moving the card', () => {
    const card = { x: 36, y: 68, w: 320, h: 112 };
    const terminal = { x: -164, y: 228, w: 720, h: 440 };
    const plan = planFrameExpansion(frame, [card, terminal]);
    expect(plan!.contained).toBe(true);
    expect(plan!.frame.x + card.x + plan!.childDx).toBe(frame.x + card.x);
    expect(plan!.frame.y + card.y + plan!.childDy).toBe(frame.y + card.y);
    const coveredRight = plan!.frame.w;
    const coveredBottom = plan!.frame.h;
    expect(terminal.x + plan!.childDx + terminal.w + FRAME_PAD).toBeLessThanOrEqual(coveredRight);
    expect(terminal.y + plan!.childDy + terminal.h + FRAME_PAD).toBeLessThanOrEqual(coveredBottom);
  });

  it('stops at maxStep when a caller asks for a smaller step', () => {
    const plan = planFrameExpansion(frame, [
      { x: 36, y: 68, w: 320, h: 112 },
      { x: -164, y: 228, w: 720, h: 440 },
    ], { maxStep: FRAME_GROW_STEP });
    expect(plan!.contained).toBe(false);
    expect(plan!.frame.w - frame.w).toBeLessThanOrEqual(FRAME_GROW_STEP * 2);
    expect(plan!.frame.h - frame.h).toBeLessThanOrEqual(FRAME_GROW_STEP * 2);
  });
});

describe('frameCanAbsorb', () => {
  it('accepts a card that only sticks out by less than one step', () => {
    expect(frameCanAbsorb(frame, [{ x: 400, y: 68, w: 320, h: 112 }])).toBe(true);
  });

  it('accepts a board-placed terminal by growing the group around it', () => {
    const card = { x: 36, y: 68, w: 320, h: 112 };
    const placed = placeLikeBoard({
      anchor: { x: frame.x + card.x, y: frame.y + card.y, w: card.w, h: card.h },
      width: 720,
      height: 440,
      beside: true,
      direction: 'vertical',
    });
    const terminal = { x: placed.x - frame.x, y: placed.y - frame.y, w: 720, h: 440 };
    expect(frameCanAbsorb(frame, [card, terminal])).toBe(true);
  });

  it('accepts a terminal the group can cover in one step', () => {
    const roomy = { x: 0, y: 0, w: 1200, h: 900 };
    const card = { x: 400, y: 80, w: 320, h: 112 };
    const placed = placeLikeBoard({
      anchor: { x: roomy.x + card.x, y: roomy.y + card.y, w: card.w, h: card.h },
      width: 720,
      height: 440,
      beside: true,
      direction: 'vertical',
    });
    const terminal = { x: placed.x - roomy.x, y: placed.y - roomy.y, w: 720, h: 440 };
    expect(frameCanAbsorb(roomy, [card, terminal])).toBe(true);
  });
});
