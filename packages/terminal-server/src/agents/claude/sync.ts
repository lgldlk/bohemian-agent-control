import * as fs from 'node:fs';
import { advanceClaudeSession } from './sessions';
import type { TurnCursor } from '../journal';

export interface ClaudeSyncSession {
  info: { agentKind?: string; status?: string; cwd: string; agentSessionId?: string };
  claudeTurn?: TurnCursor;
  claudeWatch?: fs.FSWatcher;
}

export async function syncClaudeSessions<T extends ClaudeSyncSession>(
  sessions: Iterable<T>,
  publish: (session: T, cursor: TurnCursor) => void,
): Promise<void> {
  for (const session of sessions) {
    if (session.info.agentKind !== 'claude-code' || session.info.status !== 'running') continue;
    const sessionId = session.info.agentSessionId;
    if (!sessionId || sessionId.startsWith('pending-')) continue;
    const cursor = session.claudeTurn ??= { offset: 0, partial: '', phase: 'idle', observedAt: 0 };
    const changed = await advanceClaudeSession(cursor, session.info.cwd, sessionId);
    if (cursor.path && !session.claudeWatch) {
      try {
        session.claudeWatch = fs.watch(cursor.path, () => { void syncClaudeSessions(sessions, publish); });
      } catch {
        // The poll still reads a session file that cannot be watched.
      }
    }
    if (!changed || cursor.phase === 'idle') continue;
    publish(session, cursor);
  }
}
