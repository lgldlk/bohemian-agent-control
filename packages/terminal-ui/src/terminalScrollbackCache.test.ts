import { describe, expect, it } from 'vitest';
import { captureRenderedScrollback, prependScrollback } from './terminalScrollbackCache';

describe('terminal scrollback cache', () => {
  it('keeps only lines that have scrolled off the visible screen', () => {
    const lines = ['old', 'older', 'visible'];
    const text = captureRenderedScrollback({
      rows: 1,
      buffer: {
        active: {
          length: lines.length,
          baseY: 2,
          getLine: (index) => ({ translateToString: () => lines[index] ?? '' }),
        },
      },
    });
    expect(text).toBe('old\nolder');
  });

  it('captures normal history while the alternate buffer is active', () => {
    const text = captureRenderedScrollback({
      rows: 2,
      buffer: {
        normal: {
          length: 5,
          baseY: 3,
          getLine: (index) => ({ translateToString: () => ['one', 'two', 'three'][index] ?? '' }),
        },
        active: {
          length: 2,
          baseY: 0,
          getLine: () => ({ translateToString: () => 'alternate' }),
        },
      },
    });
    expect(text).toBe('one\ntwo\nthree');
  });

  it('puts cached history above a raw snapshot without dropping the snapshot', () => {
    expect(prependScrollback('one\ntwo\n', 'screen')).toBe('one\r\ntwo\r\nscreen');
    expect(prependScrollback('   ', 'screen')).toBe('screen');
    expect(prependScrollback('kept', '\u001bcvisible')).toBe('\u001bckept\r\nvisible');
  });
});
