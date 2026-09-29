import { describe, expect, it } from 'vitest';
import {
  isTerminalPresentationSuspended,
  resolveTerminalPresentation,
} from './terminalPresentation';

const visible = {
  active: false,
  parked: false,
  documentVisible: true,
  intersecting: true,
  zoom: 1,
  physicalWidth: 500,
  physicalHeight: 240,
};

describe('terminal presentation policy', () => {
  it('keeps the focused visible terminal hot', () => {
    expect(resolveTerminalPresentation({ ...visible, active: true })).toBe('hot');
  });

  it('keeps visible background terminals warm', () => {
    expect(resolveTerminalPresentation(visible)).toBe('warm');
  });

  it('keeps an active terminal hot even when the board zoom is small', () => {
    expect(resolveTerminalPresentation({ ...visible, active: true, zoom: 0.1, physicalWidth: 80 })).toBe('hot');
  });
  it('suspends culled, hidden and too-small terminals', () => {
    expect(resolveTerminalPresentation({ ...visible, intersecting: false })).toBe('cold');
    expect(resolveTerminalPresentation({ ...visible, documentVisible: false })).toBe('cold');
    expect(resolveTerminalPresentation({ ...visible, zoom: 0.2 })).toBe('cold');
    expect(resolveTerminalPresentation({ ...visible, physicalWidth: 120 })).toBe('cold');
    expect(isTerminalPresentationSuspended('cold')).toBe(true);
  });
});
