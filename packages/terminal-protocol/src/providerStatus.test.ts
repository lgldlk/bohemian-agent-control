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

  it('normalizes Pi tool execution as working and stop as done', () => {
    expect(normalizeProviderHookStatus('pi', { type: 'tool_execution_start', session_id: 'pi-session' })?.state).toBe('working');
    expect(normalizeProviderHookStatus('pi', { type: 'agent_end', session_id: 'pi-session' })?.state).toBe('done');
  });
});
