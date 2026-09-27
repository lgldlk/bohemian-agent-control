import { describe, expect, it } from 'vitest';
import { createCommandBuffer, pushTerminalInput, searchTerminalText } from './commandHistory';

describe('pushTerminalInput', () => {
  it('commits a line on enter and ignores arrows and backspace', () => {
    const buffer = createCommandBuffer();
    pushTerminalInput(buffer, 'ec\u007fcho hi');
    pushTerminalInput(buffer, '\u001b[A');
    pushTerminalInput(buffer, '\r');
    expect(buffer.commands.map((entry) => entry.command)).toEqual(['echo hi']);
    expect(buffer.line).toBe('');
  });

  it('drops the partial line on ctrl-c', () => {
    const buffer = createCommandBuffer();
    pushTerminalInput(buffer, 'rm -rf');
    pushTerminalInput(buffer, '\u0003');
    pushTerminalInput(buffer, 'ls\n');
    expect(buffer.commands.map((entry) => entry.command)).toEqual(['ls']);
  });
});

describe('searchTerminalText', () => {
  it('matches plain lines and skips ansi', () => {
    const hits = searchTerminalText('\u001b[32mhello\u001b[0m recovery\r\nother', 'recovery', 5);
    expect(hits).toEqual(['hello recovery']);
  });
});
