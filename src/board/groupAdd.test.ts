import { describe, expect, it } from 'vitest';
import { TERMINAL_DEFAULT_H, TERMINAL_DEFAULT_W } from './boardPlacement';
import {
  FRAME_DEFAULT_H,
  FRAME_DEFAULT_W,
  FRAME_PAD,
  FRAME_TITLE,
  boxInsideFrame,
  fitGroupToAddedAgent,
  placeAddedAgent,
  planFrameExpansion,
  terminalBesideCard,
} from './groupFrame';

const CARD = { w: 320, h: 112 };

function pageOf(frame: { x: number; y: number }, box: { x: number; y: number }) {
  return { x: frame.x + box.x, y: frame.y + box.y };
}

describe('double-click add agent inside a group', () => {
  const frame = { x: 400, y: 300, w: FRAME_DEFAULT_W, h: FRAME_DEFAULT_H };
  const existing = { x: FRAME_PAD, y: FRAME_TITLE + FRAME_PAD, w: CARD.w, h: CARD.h };
  // Inside the frame, but the card body and the terminal below it hang out.
  const click = { x: 760, y: 420 };

  it('shows that fitting only the card leaves the terminal outside', () => {
    const card = { ...click, ...CARD };
    const terminal = terminalBesideCard(card, { w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H });
    const plan = planFrameExpansion(frame, [existing, card]);
    const next = plan?.frame ?? frame;
    const shifted = plan
      ? { ...terminal, x: terminal.x + plan.childDx, y: terminal.y + plan.childDy }
      : terminal;
    expect(boxInsideFrame(next, shifted)).toBe(false);
  });

  it('grows the group around the card and its terminal, and keeps the old agent put', () => {
    const before = pageOf(frame, existing);
    const fitted = fitGroupToAddedAgent({
      frame,
      existing: [existing],
      click,
      card: CARD,
      terminal: { w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H },
    });

    expect(boxInsideFrame(fitted.frame, fitted.card)).toBe(true);
    expect(boxInsideFrame(fitted.frame, fitted.terminal)).toBe(true);
    expect(pageOf(fitted.frame, fitted.existing[0])).toEqual(before);
    expect(fitted.frame.w).toBeGreaterThan(frame.w);
    expect(fitted.frame.h).toBeGreaterThan(frame.h);
  });

  it('moves a new agent off a click that would cover an existing terminal', () => {
    const blocking = { x: 36, y: 180, w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H };
    const click = { x: 120, y: 220 };
    const placed = placeAddedAgent({
      existing: [blocking],
      click,
      card: CARD,
      terminal: { w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H },
    });
    const column = {
      x: Math.min(placed.card.x, placed.terminal.x),
      y: placed.card.y,
      w: Math.max(placed.card.w, placed.terminal.w),
      h: placed.terminal.y + placed.terminal.h - placed.card.y,
    };
    const overlaps = !(column.x + column.w <= blocking.x || blocking.x + blocking.w <= column.x
      || column.y + column.h <= blocking.y || blocking.y + blocking.h <= column.y);
    expect(overlaps).toBe(false);

    const fitted = fitGroupToAddedAgent({
      frame,
      existing: [blocking],
      click,
      card: CARD,
      terminal: { w: TERMINAL_DEFAULT_W, h: TERMINAL_DEFAULT_H },
    });
    expect(pageOf(fitted.frame, fitted.existing[0])).toEqual(pageOf(frame, blocking));
    expect(boxInsideFrame(fitted.frame, fitted.card)).toBe(true);
    expect(boxInsideFrame(fitted.frame, fitted.terminal)).toBe(true);
  });
});
