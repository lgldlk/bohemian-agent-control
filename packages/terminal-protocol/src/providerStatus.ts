import type { ParsedAgentStatus } from './agentStatus';

export type ProviderHookKind = 'claude' | 'codex' | 'pi';

/** Normalize provider hook payloads before they enter the PTY status authority. */
export function normalizeProviderHookStatus(
  provider: ProviderHookKind,
  input: Record<string, unknown>,
): ParsedAgentStatus | null {
  const event = String(input.event ?? input.type ?? input.hook_event_name ?? '').toLowerCase();
  const providerSessionId = firstString(input.session_id, input.sessionId, input.conversation_id);
  const prompt = firstString(input.prompt, input.user_prompt, input.message);
  const model = firstString(input.model, input.model_name);
  const toolName = firstString(input.tool_name, input.toolName, input.tool);
  const toolInput = firstString(input.tool_input, input.toolInput);
  if (event.includes('permission') || event.includes('approval') || event.includes('question') || event.includes('blocked')) {
    return { state: 'waiting', prompt, model, toolName, toolInput, providerSessionId };
  }
  if (event.includes('stop') || event.includes('complete') || event.includes('finish') || event.includes('idle') || event.includes('end')) {
    return { state: 'done', prompt, model, lastAssistantMessage: firstString(input.last_assistant_message, input.response, input.message), providerSessionId };
  }
  if (event.includes('start') || event.includes('prompt') || event.includes('tool') || event.includes('working') || event.includes('turn')) {
    return { state: 'working', prompt, model, toolName, toolInput, providerSessionId };
  }
  if (provider === 'codex' && typeof input.status === 'string') {
    const state = input.status.toLowerCase();
    if (state === 'waiting' || state === 'blocked') return { state, prompt, model, providerSessionId };
    if (state === 'working' || state === 'running') return { state: 'working', prompt, model, providerSessionId };
    if (state === 'done' || state === 'completed' || state === 'idle') return { state: 'done', prompt, model, providerSessionId };
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 16_000);
  }
  return undefined;
}
