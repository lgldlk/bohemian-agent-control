import { describe, expect, it } from 'vitest';
import { normalizeProviderHookStatus } from './providerStatus';

describe('normalizeProviderHookStatus', () => {
  it('normalizes Claude permission hooks as waiting', () => {
    expect(normalizeProviderHookStatus('claude', {
      hook_event_name: 'PermissionRequest',
      session_id: 'claude-session',
      tool_name: 'Bash',
    })).toMatchObject({ state: 'waiting', providerSessionId: 'claude-session', toolName: 'Bash' });
  });

  it('marks Claude resume and clear as topic transitions, but not compact', () => {
    expect(normalizeProviderHookStatus('claude', {
      hook_event_name: 'SessionStart',
      source: 'resume',
      session_id: 'claude-resumed',
    })).toMatchObject({
      state: 'done',
      providerSessionId: 'claude-resumed',
      sessionSource: 'resume',
      sessionTransition: true,
    });
    expect(normalizeProviderHookStatus('claude', {
      hook_event_name: 'SessionStart',
      source: 'compact',
      session_id: 'claude-resumed',
    })).toBeNull();
  });

  it('reads Codex thread ids and marks resume as a topic transition', () => {
    expect(normalizeProviderHookStatus('codex', {
      hook_event_name: 'SessionStart',
      source: 'resume',
      thread_id: 'codex-thread',
    })).toMatchObject({
      state: 'done',
      providerSessionId: 'codex-thread',
      sessionSource: 'resume',
      sessionTransition: true,
    });
  });

  it('normalizes Pi tool execution as working and stop as done', () => {
    expect(normalizeProviderHookStatus('pi', { type: 'tool_execution_start', session_id: 'pi-session' })?.state).toBe('working');
    expect(normalizeProviderHookStatus('pi', { type: 'agent_end', session_id: 'pi-session' })?.state).toBe('done');
  });
});
