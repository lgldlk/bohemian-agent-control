/**
 * Paste into an embedded agent terminal.
 *
 * A raw newline is Enter to a TUI, so a multi-line clipboard becomes many
 * sends. This module does not split lines and does not decide how the agent
 * should submit. It hands the whole paste to the CLI with bracketed-paste
 * markers. Pi, Claude, and Codex already know how to handle that themselves.
 */

const PASTE_START = '\u001b[200~';
const PASTE_END = '\u001b[201~';

export function formatAgentPaste(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized.includes('\n')) return normalized;
  return `${PASTE_START}${normalized}${PASTE_END}`;
}

/** A typed Enter stays a single submit. A multi-line chunk is one paste for the CLI. */
export function normalizeTerminalInput(data: string): string {
  if (data === '\r' || data === '\n' || data === '\r\n') return data;
  if (!/[\r\n]/.test(data)) return data;
  return formatAgentPaste(data);
}

export interface TerminalPasteController {
  (): void;
  prepareInput(data: string): string | null;
}

export function attachTerminalPaste(root: HTMLElement, write: (data: string) => void): TerminalPasteController {
  let skipRawPaste = false;
  const onPaste = (event: ClipboardEvent) => {
    if (!(event.target instanceof Node) || (!root.contains(event.target) && event.target !== root)) return;
    const text = event.clipboardData?.getData('text/plain') ?? '';
    if (!/[\r\n]/.test(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    skipRawPaste = true;
    write(formatAgentPaste(text));
    window.setTimeout(() => {
      skipRawPaste = false;
    }, 0);
  };
  const prepareInput = (data: string): string | null => {
    if (skipRawPaste && /[\r\n]/.test(data) && data !== '\r' && data !== '\n') return null;
    return normalizeTerminalInput(data);
  };
  root.addEventListener('paste', onPaste, true);
  document.addEventListener('paste', onPaste, true);
  const detach = (() => {
    root.removeEventListener('paste', onPaste, true);
    document.removeEventListener('paste', onPaste, true);
  }) as TerminalPasteController;
  detach.prepareInput = prepareInput;
  return detach;
}
