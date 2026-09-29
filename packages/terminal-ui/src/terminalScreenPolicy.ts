/**
 * Not used by the live terminal. Do not put it back on the write path.
 * Dropping alternate-screen switches forces a TUI repaint onto the normal
 * buffer. A cursor-addressed row that ends in CR LF then scrolls into history
 * and leaves a blank gap or stale cells. Orca keeps those switches and lets
 * xterm paint the alternate buffer.
 */
const DROPPED_SCREEN_SEQUENCES = [
  '\u001b[?1049h',
  '\u001b[?1049l',
  '\u001b[?1047h',
  '\u001b[?1047l',
  '\u001b[?47h',
  '\u001b[?47l',
  '\u001b[3J',
] as const;

const ENTER_ALT = new Set<string>(['\u001b[?1049h', '\u001b[?1047h', '\u001b[?47h']);
const LEAVE_ALT = new Set<string>(['\u001b[?1049l', '\u001b[?1047l', '\u001b[?47l']);
const CURSOR_ADDRESS = /^\u001b\[\d+;\d+[Hf]/;

function isCursorAddressPrefix(value: string): boolean {
  return /^\[\d*(?:;\d*)?$/.test(value);
}

function isSequencePrefix(value: string): boolean {
  return DROPPED_SCREEN_SEQUENCES.some((sequence) => sequence.startsWith(value))
    || isCursorAddressPrefix(value);
}

export interface TerminalScreenPolicy {
  filter(data: string): string;
  reset(): void;
}

export function createTerminalScreenPolicy(): TerminalScreenPolicy {
  let pending = '';
  let screenPaint = false;

  const accept = (text: string) => screenPaint ? text.replace(/\n/g, '') : text;

  return {
    filter(data: string): string {
      const input = pending + data;
      pending = '';
      let output = '';
      let index = 0;
      while (index < input.length) {
        const escape = input.indexOf('\u001b', index);
        if (escape < 0) {
          output += accept(input.slice(index));
          break;
        }
        output += accept(input.slice(index, escape));
        const rest = input.slice(escape);
        const exact = DROPPED_SCREEN_SEQUENCES.find((sequence) => rest.startsWith(sequence));
        if (exact) {
          if (ENTER_ALT.has(exact)) screenPaint = true;
          if (LEAVE_ALT.has(exact)) screenPaint = false;
          index = escape + exact.length;
          continue;
        }
        const addressed = CURSOR_ADDRESS.exec(rest);
        if (addressed) {
          screenPaint = true;
          output += addressed[0];
          index = escape + addressed[0].length;
          continue;
        }
        const possible = rest.length < 16 && isSequencePrefix(rest);
        if (possible) {
          pending = rest;
          break;
        }
        output += '\u001b';
        index = escape + 1;
      }
      return output;
    },
    reset(): void {
      pending = '';
      screenPaint = false;
    },
  };
}

export function filterAlternateScreenSequences(data: string): string {
  return createTerminalScreenPolicy().filter(data);
}
