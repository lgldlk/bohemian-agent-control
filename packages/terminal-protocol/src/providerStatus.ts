import type { ParsedAgentStatus } from './agentStatus';

export type ProviderHookKind = 'claude' | 'codex' | 'pi';

/** Normalize provider hook payloads before they enter the PTY status authority. */
export function normalizeProviderHookStatus(
  provider: ProviderHookKind,
  input: Record<string, unknown>,
): ParsedAgentStatus | null {
  const event = String(input.event ?? input.type ?? input.hook_event_name ?? '').toLowerCase();
  const source = firstString(input.source, input.session_source, input.sessionSource)?.toLowerCase();
  const providerSessionId = provider === 'codex'
    ? firstString(input.session_id, input.sessionId, input.thread_id, input.threadId)
    : firstString(input.session_id, input.sessionId, input.conversation_id, input.conversationId);
  const sessionStart = event.includes('sessionstart') || event.includes('session_start');
  const sessionTransition = sessionStart && source !== 'compact';
  const metadata = {
    providerEvent: event || undefined,
    sessionSource: source,
    sessionTransition: sessionTransition || undefined,
  };
  const prompt = firstString(input.prompt, input.user_prompt, input.message);
  const model = firstString(input.model, input.model_name);
  const toolName = firstString(input.tool_name, input.toolName, input.tool);
  const toolInput = firstString(input.tool_input, input.toolInput);
  if (sessionStart && source === 'compact') return null;
  if (sessionStart) {
    return { state: 'done', prompt, model, providerSessionId, ...metadata };
  }
  if (event.includes('permission') || event.includes('approval') || event.includes('question') || event.includes('blocked')) {
    return { state: 'waiting', prompt, model, toolName, toolInput, providerSessionId, ...metadata };
  }
  if (event.includes('stop') || event.includes('complete') || event.includes('finish') || event.includes('idle') || event.includes('end')) {
    return { state: 'done', prompt, model, lastAssistantMessage: firstString(input.last_assistant_message, input.response, input.message), providerSessionId, ...metadata };
  }
  if (event.includes('start') || event.includes('prompt') || event.includes('tool') || event.includes('working') || event.includes('turn')) {
    return { state: 'working', prompt, model, toolName, toolInput, providerSessionId, ...metadata };
  }
  if (provider === 'codex' && typeof input.status === 'string') {
    const state = input.status.toLowerCase();
    if (state === 'waiting' || state === 'blocked') return { state, prompt, model, providerSessionId, ...metadata };
    if (state === 'working' || state === 'running') return { state: 'working', prompt, model, providerSessionId, ...metadata };
    if (state === 'done' || state === 'completed' || state === 'idle') return { state: 'done', prompt, model, providerSessionId, ...metadata };
  }
  return null;
}

function firstString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 16_000);
  }
  return undefined;
}
