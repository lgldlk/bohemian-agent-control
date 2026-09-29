/**
 * Browser/xterm input normalization for embedded Agent terminals.
 *
 * Escape is forwarded explicitly because tldraw handles it during capture to
 * exit shape editing before xterm's textarea can receive the event.
 *
 * Shift+Enter is sent as Ctrl+J (`\n`), the portable Agent-editor newline.
 *
 * tmux has no Super/Cmd modifier. A literal Cmd+Right sequence (`CSI 1;9 C`)
 * is decoded by tmux and rewritten as Alt+Right (`CSI 1;3 C`). Preserve the
 * macOS editing meaning instead of the unavailable modifier:
 *
 *   Cmd+Left/Right       -> Home/End (line start/end)
 *   Cmd+Up/Down          -> Ctrl+Home/End (document start/end where supported)
 *   Cmd+Shift+Arrow      -> the corresponding selecting navigation sequence
 */

function modifierParam(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'shiftKey'>,
  forceCtrl = false,
): number {
  return 1
    + (event.shiftKey ? 1 : 0)
    + (event.altKey ? 2 : 0)
    + (event.ctrlKey || forceCtrl ? 4 : 0);
}

function homeEndSequence(final: 'H' | 'F', modifier: number): string {
  return modifier === 1 ? `\u001b[${final}` : `\u001b[1;${modifier}${final}`;
}

export function terminalShortcutInput(event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey' | 'type'>): string | null {
  if (event.type !== 'keydown') return null;
  if ((event.key === 'Escape' || event.key === 'Esc') && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    return '\u001b';
  }
  if (event.key === 'Enter' && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return '\n';
  }
  if (!event.metaKey) return null;

  switch (event.key) {
    case 'ArrowLeft':
      return homeEndSequence('H', modifierParam(event));
    case 'ArrowRight':
      return homeEndSequence('F', modifierParam(event));
    case 'ArrowUp':
      return homeEndSequence('H', modifierParam(event, true));
    case 'ArrowDown':
      return homeEndSequence('F', modifierParam(event, true));
    default:
      return null;
  }
}

export function isTerminalShortcutTarget(root: { contains(node: Node): boolean }, target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object' || !('nodeType' in target)) return false;
  const node = target as Node & { tagName?: string };
  if (!root.contains(node)) return false;
  const tag = node.tagName;
  return tag !== 'INPUT' && tag !== 'SELECT' && tag !== 'BUTTON';
}
