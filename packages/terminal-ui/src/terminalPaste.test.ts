import { describe, expect, it } from 'vitest';
import { formatAgentPaste, normalizeTerminalInput } from './terminalPaste';

describe('agent paste', () => {
  it('leaves a single line for the CLI unchanged', () => {
    expect(formatAgentPaste('hello')).toBe('hello');
  });

  it('sends a multi-line paste as one bracketed block, not one enter per line', () => {
    const pasted = formatAgentPaste('one\r\ntwo\nthree');
    expect(pasted).toBe('\u001b[200~one\ntwo\nthree\u001b[201~');
    expect(pasted.includes('\r')).toBe(false);
    expect(pasted.split('\u001b[200~')).toHaveLength(2);
  });

  it('turns xterm newline-as-enter paste into one CLI paste, but keeps a real Enter', () => {
    expect(normalizeTerminalInput('\r')).toBe('\r');
    expect(normalizeTerminalInput('one\rtwo\rthree')).toBe('\u001b[200~one\ntwo\nthree\u001b[201~');
  });
});
