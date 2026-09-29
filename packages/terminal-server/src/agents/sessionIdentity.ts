import type { ParsedAgentStatus, TerminalInfo } from '@bohemian/terminal-protocol';

export type MutableSessionIdentity = Pick<TerminalInfo, 'agentSessionId' | 'nodeId' | 'launchId'>;

export interface SessionIdentityUpdate {
  changed: boolean;
  sessionChanged: boolean;
}

export type ProviderStatusSessionAction = 'current' | 'adopt' | 'stale';

/** Reject late events from the previous Claude/Codex/Pi topic after a session switch. */
export function providerStatusSessionAction(
  currentSessionId: string | undefined,
  payload: Pick<ParsedAgentStatus, 'providerSessionId' | 'sessionTransition'>,
): ProviderStatusSessionAction {
  const providerSessionId = payload.providerSessionId?.trim();
  if (!providerSessionId || providerSessionId === currentSessionId) return 'current';
  if (!currentSessionId || payload.sessionTransition === true) return 'adopt';
  return 'stale';
}

/** Apply a provider session identity without confusing a pending launch id for a real session. */
export function applySessionIdentity(
  info: MutableSessionIdentity,
  sessionId: string,
  forceNode: boolean,
): SessionIdentityUpdate {
  const nextSessionId = sessionId.trim();
  if (!nextSessionId || nextSessionId.startsWith('pending-')) {
    return { changed: false, sessionChanged: false };
  }

  const sessionChanged = info.agentSessionId !== nextSessionId;
  let changed = sessionChanged;
  if (sessionChanged) info.agentSessionId = nextSessionId;

  const nodeId = info.nodeId;
  const unbound = !nodeId || nodeId.startsWith('pending-') || nodeId === info.launchId;
  if ((unbound || forceNode) && nodeId !== nextSessionId) {
    info.nodeId = nextSessionId;
    changed = true;
  }

  return { changed, sessionChanged };
}
