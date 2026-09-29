import * as fs from 'node:fs';
import { advancePiSession } from './sessions';
import type { TurnCursor } from '../journal';

export interface PiSyncSession {
  info: {
    agentKind?: string;
    status?: string;
    cwd: string;
    agentSessionId?: string;
    nodeId?: string;
    launchId?: string;
  };
  piTurn?: TurnCursor;
  piWatch?: fs.FSWatcher;
}

export async function syncPiSessions(
  sessions: Iterable<PiSyncSession>,
  publish: (session: PiSyncSession, cursor: TurnCursor) => void,
): Promise<void> {
  for (const session of sessions) {
    if (session.info.agentKind !== 'pi' || session.info.status !== 'running') continue;
    const sessionId = session.info.agentSessionId
      || [session.info.nodeId, session.info.launchId].find((id) => id && !id.startsWith('pending-'));
    if (!sessionId || sessionId.startsWith('pending-')) continue;
    const cursor = session.piTurn ??= { offset: 0, partial: '', phase: 'idle', observedAt: 0 };
    const changed = await advancePiSession(cursor, session.info.cwd, sessionId);
    if (cursor.path && !session.piWatch) {
      try {
        session.piWatch = fs.watch(cursor.path, () => { void syncPiSessions(sessions, publish); });
      } catch {
        // The poll still reads a session file that cannot be watched.
      }
    }
    if (!changed || cursor.phase === 'idle') continue;
    publish(session, cursor);
  }
}
