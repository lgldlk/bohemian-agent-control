/**
 * The terminal scrollbar is xterm's history, not a CSS decoration.
 * Full-screen programs erase that history on resize (CSI 3 J). Hiding the
 * tmux status bar resizes the pane, so the redraw removes the scrollbar.
 * Drop only that erase. Leave normal screen clears alone.
 */

export function preserveTerminalScrollback(data: string): string {
  return data.replace(/\u001b\[3J/g, '');
}
