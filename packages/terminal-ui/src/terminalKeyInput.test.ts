import { describe, expect, it } from 'vitest';
import { isTerminalShortcutTarget, terminalShortcutInput } from './terminalKeyInput';

function key(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'key'>): Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey' | 'shiftKey' | 'type'> {
  return {
    type: 'keydown',
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...partial,
  };
}

describe('terminal shortcut input', () => {
  it('forwards Escape to the Agent before tldraw exits shape editing', () => {
    expect(terminalShortcutInput(key({ key: 'Escape' }))).toBe('\u001b');
    expect(terminalShortcutInput(key({ key: 'Esc' }))).toBe('\u001b');
    expect(terminalShortcutInput(key({ key: 'Escape', shiftKey: true }))).toBeNull();
  });

  it('sends Shift+Enter as Ctrl+J so Agent editors insert a newline', () => {
    expect(terminalShortcutInput(key({ key: 'Enter', shiftKey: true }))).toBe('\n');
  });

  it('maps Cmd+Left/Right to line start/end instead of a Super modifier tmux cannot preserve', () => {
    expect(terminalShortcutInput(key({ key: 'ArrowLeft', metaKey: true }))).toBe('\u001b[H');
    expect(terminalShortcutInput(key({ key: 'ArrowRight', metaKey: true }))).toBe('\u001b[F');
    expect(terminalShortcutInput(key({ key: 'ArrowLeft', metaKey: true, shiftKey: true }))).toBe('\u001b[1;2H');
    expect(terminalShortcutInput(key({ key: 'ArrowRight', metaKey: true, shiftKey: true }))).toBe('\u001b[1;2F');
  });

  it('maps Cmd+Up/Down to document start/end navigation', () => {
    expect(terminalShortcutInput(key({ key: 'ArrowUp', metaKey: true }))).toBe('\u001b[1;5H');
    expect(terminalShortcutInput(key({ key: 'ArrowDown', metaKey: true }))).toBe('\u001b[1;5F');
    expect(terminalShortcutInput(key({ key: 'ArrowUp', metaKey: true, shiftKey: true }))).toBe('\u001b[1;6H');
    expect(terminalShortcutInput(key({ key: 'ArrowDown', metaKey: true, shiftKey: true }))).toBe('\u001b[1;6F');
  });

  it('does not steal ordinary typing or browser/agent letter shortcuts', () => {
    expect(terminalShortcutInput(key({ key: 'Enter' }))).toBeNull();
    expect(terminalShortcutInput(key({ key: 'k', metaKey: true }))).toBeNull();
    expect(terminalShortcutInput(key({ key: 'f', ctrlKey: true }))).toBeNull();
    expect(terminalShortcutInput(key({ key: 'ArrowRight' }))).toBeNull();
  });

  it('ignores search inputs inside the terminal chrome', () => {
    const search = { nodeType: 1, tagName: 'INPUT' };
    const screen = { nodeType: 1, tagName: 'DIV' };
    const root = { contains: (node: Node) => node === search || node === screen };
    expect(isTerminalShortcutTarget(root, search as unknown as EventTarget)).toBe(false);
    expect(isTerminalShortcutTarget(root, screen as unknown as EventTarget)).toBe(true);
    expect(isTerminalShortcutTarget(root, { nodeType: 1, tagName: 'DIV' } as unknown as EventTarget)).toBe(false);
  });
});
