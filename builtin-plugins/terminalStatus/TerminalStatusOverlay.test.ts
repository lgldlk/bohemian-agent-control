import { describe, expect, it } from 'vitest';
import { isTerminalStatusVisible } from './TerminalStatusOverlay';

describe('terminal status overlay visibility', () => {
  it('keeps the user-facing explanations and hides obvious terminal states', () => {
    expect(isTerminalStatusVisible('loading')).toBe(true);
    expect(isTerminalStatusVisible('reconnecting')).toBe(true);
    expect(isTerminalStatusVisible('error')).toBe(true);
    expect(isTerminalStatusVisible('blocked')).toBe(true);
    expect(isTerminalStatusVisible('running')).toBe(false);
    expect(isTerminalStatusVisible('idle')).toBe(false);
    expect(isTerminalStatusVisible('ready')).toBe(false);
  });
});
