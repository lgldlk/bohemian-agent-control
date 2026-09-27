import { Router, type Router as RouterType } from 'express';
import { homeRoot, listHomeDir } from '../../fs/homeDir';
import { asyncHandler } from '../errors';

export function fsRouter(): RouterType {
  const r = Router();
  r.get(
    '/api/dir',
    asyncHandler(async (req, res) => {
      const raw = typeof req.query.path === 'string' && req.query.path ? req.query.path : homeRoot();
      res.json({ success: true, ...listHomeDir(raw) });
    }),
  );
  return r;
}
