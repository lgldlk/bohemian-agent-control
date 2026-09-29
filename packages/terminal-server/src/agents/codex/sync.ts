import * as fs from 'node:fs';
import { advanceCodexTurn } from './sessions';
import type { TurnCursor } from '../journal';

export interface CodexSyncSession {
  info: { agentKind?: string; status?: string; agentSessionId?: string };
  codexTurn?: TurnCursor;
  codexWatch?: fs.FSWatcher;
}

export async function syncCodexSessions<T extends CodexSyncSession>(
  sessions: Iterable<T>,
  publish: (session: T, cursor: TurnCursor) => void,
): Promise<void> {
  for (const session of sessions) {
    if (session.info.agentKind !== 'codex' || session.info.status !== 'running') continue;
    const sessionId = session.info.agentSessionId;
    if (!sessionId || sessionId.startsWith('pending-')) continue;
    const cursor = session.codexTurn ??= { offset: 0, partial: '', phase: 'idle', observedAt: 0 };
    const changed = await advanceCodexTurn(cursor, sessionId);
    if (cursor.path && !session.codexWatch) {
      try {
        session.codexWatch = fs.watch(cursor.path, () => { void syncCodexSessions(sessions, publish); });
      } catch {
        // The poll still reads a rollout that cannot be watched.
      }
    }
    if (!changed || cursor.phase === 'idle') continue;
    publish(session, cursor);
  }
}
