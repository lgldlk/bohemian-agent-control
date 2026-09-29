import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

type Listener = (resource: TerminalResourceRef) => void;
const listeners = new Set<Listener>();

export function onResourceActivated(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitResourceActivated(resource: TerminalResourceRef): void {
  listeners.forEach((listener) => listener(resource));
}
