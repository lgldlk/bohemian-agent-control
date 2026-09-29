/**
 * The terminal scrollbar is xterm's history, not a CSS decoration.
 * Full-screen programs erase that history on resize (CSI 3 J). Hiding the
 * tmux status bar resizes the pane, so the redraw removes the scrollbar.
 * Drop only that erase. Leave normal screen clears alone.
 */

export function preserveTerminalScrollback(data: string): string {
  return data.replace(/\u001b\[3J/g, '');
}

const ERASE_SCROLLBACK = '\u001b[3J';

/**
 * PTY chunks can split an escape sequence, so filtering each frame with a
 * stateless replace is not sufficient. Keep a partial CSI 3 J until the next
 * frame completes it.
 */
export function createTerminalScrollbackFilter(): {
  filter(data: string): string;
  reset(): void;
} {
  let pending = '';

  return {
    filter(data: string): string {
      const input = pending + data;
      pending = '';
      let output = '';
      let index = 0;
      while (index < input.length) {
        const escape = input.indexOf('\u001b', index);
        if (escape < 0) {
          output += input.slice(index);
          break;
        }
        output += input.slice(index, escape);
        const rest = input.slice(escape);
        if (rest.startsWith(ERASE_SCROLLBACK)) {
          index = escape + ERASE_SCROLLBACK.length;
          continue;
        }
        if (rest.length < ERASE_SCROLLBACK.length && ERASE_SCROLLBACK.startsWith(rest)) {
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
    },
  };
}
