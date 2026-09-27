/** Identity shared by a PTY, its launch, and the agent session it is bound to. */
export interface TerminalIdentity {
  launchId?: string;
  nodeId?: string;
  agentSessionId?: string;
  status?: string;
}

export function terminalIdentityKeys(info: TerminalIdentity): string[] {
  return [info.launchId, info.nodeId, info.agentSessionId].filter((id): id is string => Boolean(id));
}

export function terminalMatchesIdentity(info: TerminalIdentity, id: string | undefined): boolean {
  if (!id) return false;
  return info.nodeId === id || info.agentSessionId === id || info.launchId === id;
}

/** Real session id. Pending launch ids are not a bound session. */
export function boundSessionId(info: TerminalIdentity): string | undefined {
  if (info.agentSessionId && !info.agentSessionId.startsWith('pending-')) return info.agentSessionId;
  if (info.nodeId && !info.nodeId.startsWith('pending-') && info.nodeId !== info.launchId) return info.nodeId;
  return undefined;
}

export function processStateFromTerminalStatus(status: string | undefined): 'starting' | 'running' | 'exited' {
  if (status === 'running') return 'running';
  if (status === 'starting') return 'starting';
  return 'exited';
}

/** Shape-level view: an unmatched running flag stays unknown instead of exited. */
export function observedProcessState(input: {
  running: boolean;
  missing?: boolean;
  status?: string | null;
}): 'starting' | 'running' | 'exited' | 'missing' | null {
  if (input.running) return 'running';
  if (input.missing) return 'missing';
  if (input.status === 'exited') return 'exited';
  if (input.status === 'starting') return 'starting';
  return null;
}
