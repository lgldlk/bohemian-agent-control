export interface SessionCopy {
  id: string;
  agentKind: string;
}

export function sessionFromShape(shape: { type: string; props: Record<string, unknown> }): SessionCopy | null {
  if (shape.type === 'task-card') {
    const id = typeof shape.props.taskId === 'string' ? shape.props.taskId : '';
    if (!id) return null;
    return {
      id,
      agentKind: typeof shape.props.agentKind === 'string' ? shape.props.agentKind : '',
    };
  }
  if (shape.type === 'terminal') {
    const id = typeof shape.props.nodeId === 'string' ? shape.props.nodeId : '';
    if (!id) return null;
    return { id, agentKind: '' };
  }
  return null;
}

export function sessionStartCommand(agentKind: string | undefined): string {
  if (agentKind === 'codex') return 'codex';
  if (agentKind === 'claude-code') return 'claude';
  if (agentKind === 'pi') return 'pi';
  return '';
}

export function sessionResumeCommand(agentKind: string | undefined, sessionId: string): string {
  if (!sessionId) return '';
  const id = shellQuote(sessionId);
  if (agentKind === 'codex') return `codex resume ${id}`;
  if (agentKind === 'claude-code') return `claude --resume ${id}`;
  if (agentKind === 'pi') return `pi --session ${id}`;
  return sessionId;
}

export function formatSessionCopy(sessions: SessionCopy[]): string {
  return sessions
    .map((session) => sessionResumeCommand(session.agentKind, session.id))
    .filter(Boolean)
    .join('\n');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
