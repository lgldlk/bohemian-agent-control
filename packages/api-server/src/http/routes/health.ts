import { Router, type Router as RouterType } from 'express';
import type { AgentRegistry } from '../../agents';
import { asyncHandler } from '../errors';

export function healthRouter(registry: AgentRegistry): RouterType {
  const r = Router();
  r.get(
    '/api/health',
    asyncHandler(async (_req, res) => {
      const agents = await registry.health();
      res.json({ ok: true, agents });
    }),
  );
  return r;
}
