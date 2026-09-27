import { describe, expect, it } from 'vitest';
import { createTerminalScreenPolicy, filterAlternateScreenSequences } from './terminalScreenPolicy';

describe('terminal screen policy', () => {
  it('removes alternate-screen switches while preserving the TUI drawing bytes', () => {
    expect(filterAlternateScreenSequences('\u001b[?1049hscreen\u001b[2J\u001b[?1049l')).toBe('screen\u001b[2J');
  });

  it('handles a switch split across output frames', () => {
    const policy = createTerminalScreenPolicy();
    expect(policy.filter('before\u001b[?10')).toBe('before');
    expect(policy.filter('49hafter')).toBe('after');
  });

  it('does not remove unrelated CSI controls', () => {
    expect(filterAlternateScreenSequences('\u001b[2J\u001b[?25ltext')).toBe('\u001b[2J\u001b[?25ltext');
  });

  it('drops erase-scrollback so a resize redraw does not remove the scrollbar', () => {
    expect(filterAlternateScreenSequences('kept\u001b[3J\u001b[2Jvisible')).toBe('kept\u001b[2Jvisible');
  });

  it('does not scroll a cursor-addressed row into the history above the text', () => {
    expect(filterAlternateScreenSequences('shell\r\n\u001b[8;1H\u001b[K\r\ncode\u001b[22;1H\u001b[K\r\n')).toBe(
      'shell\r\n\u001b[8;1H\u001b[K\rcode\u001b[22;1H\u001b[K\r',
    );
  });

  it('keeps a normal fullscreen transcript that only homes the cursor', () => {
    expect(filterAlternateScreenSequences('\u001b[2J\u001b[Hline\r\nnext\r\n')).toBe('\u001b[2J\u001b[Hline\r\nnext\r\n');
  });
});
