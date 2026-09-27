import { describe, expect, it } from 'vitest';
import { preserveTerminalScrollback } from './terminalScrollback';

describe('preserveTerminalScrollback', () => {
  it('removes erase-scrollback without touching the visible screen clear', () => {
    expect(preserveTerminalScrollback('kept\u001b[3J\u001b[2Jvisible')).toBe('kept\u001b[2Jvisible');
  });
});
