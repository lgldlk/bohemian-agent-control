import { describe, expect, it } from 'vitest';
import { sanitizeTerminalOutput } from './terminalOutputSanitizer';

describe('legacy terminal identity output cleanup', () => {
  it('removes repeated DA1 and DA2 echoes without changing surrounding output', () => {
    expect(sanitizeTerminalOutput('before?1;2c?1;2cafter')).toBe('beforeafter');
    expect(sanitizeTerminalOutput('before0;276;0c0;276;0cafter')).toBe('beforeafter');
    expect(sanitizeTerminalOutput('before\u001b[?1;2c\u001b[>0;276;0cafter')).toBe('beforeafter');
  });

  it('removes XTVERSION replies for any xterm.js version', () => {
    const dcs = '\u001bP>|xterm.js(6.1.0-beta.303)\u001b\\';
    const payload = '>|xterm.js(6.1.0-beta.303)';
    expect(sanitizeTerminalOutput(`before${dcs}${payload}${payload}after`)).toBe('beforeafter');
    expect(sanitizeTerminalOutput('>|xterm.js(5.5.0)>|xterm.js(7.0.0)')).toBe('');
  });

  it('removes wrapped artifact lines and their indentation without blank rows', () => {
    expect(sanitizeTerminalOutput('>|\n  xterm.js(6.1.0-beta.303)')).toBe('');
    expect(sanitizeTerminalOutput('before\r\n>|\r\n  xterm.js(6.1.0-beta.303)\r\nafter')).toBe('before\r\nafter');
    expect(sanitizeTerminalOutput('>|xterm.js(6.1.0-beta.303)>|xterm.js(6.1.0-beta.303)>|\n  xterm.js(6.1.0-beta.303)')).toBe('');
  });

  it('leaves ordinary text and keyboard negotiation unchanged', () => {
    expect(sanitizeTerminalOutput('hello\u001b[2Jworld')).toBe('hello\u001b[2Jworld');
    expect(sanitizeTerminalOutput('xterm.js is the renderer')).toBe('xterm.js is the renderer');
    expect(sanitizeTerminalOutput('\u001b[>7u\u001b[?7u\u001b[13;2u')).toBe('\u001b[>7u\u001b[?7u\u001b[13;2u');
  });
});
