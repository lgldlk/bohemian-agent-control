import { Router, type Router as RouterType } from 'express';
import { toControlTask } from '@bohemian/agent-protocol';
import type { AgentRegistry } from '../../agents';
import { homeRoot } from '../../fs/homeDir';
import type { SnapshotClock } from '../../snapshot';
import { asyncHandler } from '../errors';

export function sessionsRouter(registry: AgentRegistry, snapshot: SnapshotClock): RouterType {
  const r = Router();

  r.get(
    '/api/digest',
    asyncHandler(async (_req, res) => {
      const d = await registry.digest();
      const rev = snapshot.touch(d.fingerprint);
      res.json({
        success: true,
        rev,
        sessions: d.sessions.map((s) => ({
          id: s.id,
          agentKind: s.agentKind,
          modified: s.modified,
          messageCount: s.messageCount,
          status: s.status ?? 'completed',
        })),
      });
    }),
  );

  r.get(
    '/api/sessions',
    asyncHandler(async (_req, res) => {
      const [d, sessions] = await Promise.all([registry.digest(), registry.listSessions()]);
      const rev = snapshot.touch(d.fingerprint);
      const tasks = sessions.map(toControlTask);
      res.json({ success: true, rev, tasks, sessionCount: tasks.length });
    }),
  );

  r.get(
    '/api/workspaces',
    asyncHandler(async (_req, res) => {
      const workspaces = await registry.listWorkspaces();
      res.json({ success: true, home: homeRoot(), workspaces });
    }),
  );

  return r;
}
