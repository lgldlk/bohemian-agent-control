import { describe, expect, it, vi } from 'vitest';
import {
  canAutoFocusAgentInput,
  focusAgentInput,
  isAgentInputReady,
  resolveAgentInputFocusKind,
  shouldAutoFocusAgentInput,
} from './agentInputFocus';

describe('agentInputFocus', () => {
  it.each([
    ['pi', 'pi'],
    ['claude-code', 'claude-code'],
    ['claude', 'claude-code'],
    ['codex', 'codex'],
  ] as const)('routes %s through its provider focus adapter', (agentKind, expected) => {
    const focus = vi.fn();

    expect(resolveAgentInputFocusKind(agentKind)).toBe(expected);
    expect(canAutoFocusAgentInput(agentKind)).toBe(true);
    expect(shouldAutoFocusAgentInput(agentKind, 'starting')).toBe(true);
    expect(shouldAutoFocusAgentInput(agentKind, 'running')).toBe(true);
    expect(isAgentInputReady(agentKind, 'running', 'ready')).toBe(true);
    expect(focusAgentInput(agentKind, { focus })).toBe(true);
    expect(focus).toHaveBeenCalledOnce();
  });

  it('does not auto-focus unmanaged, free, or exited terminals', () => {
    const focus = vi.fn();

    expect(resolveAgentInputFocusKind('shell')).toBeNull();
    expect(canAutoFocusAgentInput(undefined)).toBe(false);
    expect(shouldAutoFocusAgentInput('pi', 'exited')).toBe(false);
    expect(shouldAutoFocusAgentInput('shell', 'running')).toBe(false);
    expect(isAgentInputReady('pi', 'starting', 'ready')).toBe(false);
    expect(isAgentInputReady('pi', 'running', 'reconnecting')).toBe(false);
    expect(isAgentInputReady('claude-code', 'running', 'hydrating')).toBe(false);
    expect(isAgentInputReady('codex', 'running', 'connecting')).toBe(false);
    expect(focusAgentInput('shell', { focus })).toBe(false);
    expect(focus).not.toHaveBeenCalled();
  });
});
