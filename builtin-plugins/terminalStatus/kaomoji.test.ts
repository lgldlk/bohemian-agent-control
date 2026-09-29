import { describe, expect, it } from 'vitest';
import {
  TERMINAL_STATUS_KAOMOJI,
  TERMINAL_STATUS_KAOMOJI_COLLECTION,
  pickTerminalKaomoji,
} from './kaomoji';

describe('terminal status kaomoji', () => {
  it('covers every runtime and board status used by the overlay', () => {
    expect(Object.values(TERMINAL_STATUS_KAOMOJI)).not.toContain('');
    expect(TERMINAL_STATUS_KAOMOJI_COLLECTION.loading).toContain('( ˘ω˘ )');
    expect(TERMINAL_STATUS_KAOMOJI_COLLECTION.error).toContain('(╥﹏╥)');
    expect(TERMINAL_STATUS_KAOMOJI_COLLECTION.missing).toContain('(・_・;)');
  });

  it('keeps a reusable collection for future status pickers', () => {
    for (const faces of Object.values(TERMINAL_STATUS_KAOMOJI_COLLECTION)) {
      expect(faces.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('picks deterministically from the requested status pool', () => {
    expect(pickTerminalKaomoji('error', () => 0)).toBe(TERMINAL_STATUS_KAOMOJI_COLLECTION.error[0]);
    expect(pickTerminalKaomoji('error', () => 0.99)).toBe(TERMINAL_STATUS_KAOMOJI_COLLECTION.error.at(-1));
  });
});
