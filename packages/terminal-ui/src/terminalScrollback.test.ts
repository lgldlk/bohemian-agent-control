import { describe, expect, it } from 'vitest';
import { createTerminalScrollbackFilter, preserveTerminalScrollback } from './terminalScrollback';

describe('preserveTerminalScrollback', () => {
  it('removes erase-scrollback without touching the visible screen clear', () => {
    expect(preserveTerminalScrollback('kept\u001b[3J\u001b[2Jvisible')).toBe('kept\u001b[2Jvisible');
  });

  it('removes an erase-scrollback sequence split across output frames', () => {
    const filter = createTerminalScrollbackFilter();
    expect(filter.filter('kept\u001b[3')).toBe('kept');
    expect(filter.filter('J\u001b[2Jvisible')).toBe('\u001b[2Jvisible');
  });
});
