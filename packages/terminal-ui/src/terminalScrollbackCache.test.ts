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

  it('puts cached history above a raw snapshot without dropping the snapshot', () => {
    expect(prependScrollback('one\ntwo\n', 'screen')).toBe('one\r\ntwo\r\nscreen');
    expect(prependScrollback('   ', 'screen')).toBe('screen');
    expect(prependScrollback('kept', '\u001bcvisible')).toBe('\u001bckept\r\nvisible');
  });
});
