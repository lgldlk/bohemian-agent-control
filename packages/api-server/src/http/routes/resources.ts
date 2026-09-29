import { Router, type Router as RouterType } from 'express';
import type { AgentRegistry } from '../../agents';
import { asyncHandler, HttpError } from '../errors';
import {
  importResourceStream,
  MAX_RESOURCE_IMPORT_BYTES,
  openResource,
  readResource,
  resourceImportRoot,
  statResource,
  streamResource,
} from '../../fs/resources';

export function resourcesRouter(registry: AgentRegistry): RouterType {
  const router = Router();

  let rootsCache: { expiresAt: number; roots: string[] } | null = null;
  const knownRoots = async (): Promise<string[]> => {
    if (rootsCache && rootsCache.expiresAt > Date.now()) return rootsCache.roots;
    const [workspaces, sessions] = await Promise.all([
      registry.listWorkspaces().catch(() => []),
      registry.listSessions().catch(() => []),
    ]);
    const roots = [...new Set([
      resourceImportRoot(),
      ...workspaces.map((workspace) => workspace.path),
      ...sessions.map((session) => session.workingDir),
    ].filter(Boolean))];
    rootsCache = { roots, expiresAt: Date.now() + 10_000 };
    return roots;
  };

  router.post('/api/fs/import', asyncHandler(async (req, res) => {
    const name = typeof req.query.name === 'string' ? req.query.name : '';
    const suppliedMimeType = typeof req.query.mimeType === 'string' ? req.query.mimeType : undefined;
    if (!name.trim()) throw new HttpError(400, '缺少文件名', 'invalid_filename');
    const declaredLength = Number(req.headers['content-length'] ?? 0);
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RESOURCE_IMPORT_BYTES) {
      throw new HttpError(413, '文件过大，无法导入', 'file_too_large');
    }
    const imported = await importResourceStream(
      name,
      req as unknown as AsyncIterable<Uint8Array>,
      suppliedMimeType,
    );
    res.json({ success: true, ...imported });
  }));

  router.get('/api/fs/stat', asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    res.json({ success: true, ...statResource(rawPath, cwd, await knownRoots()) });
  }));

  router.get('/api/fs/read', asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    const result = readResource(rawPath, cwd, await knownRoots());
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type(result.stat.mimeType ?? 'text/plain').send(result.content);
  }));

  router.get('/api/fs/preview', asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    const result = streamResource(rawPath, cwd, await knownRoots(), req.headers.range);
    if (result.range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.stat.size}`);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(result.contentLength));
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', result.stat.mimeType ?? 'application/octet-stream');
    result.stream.on('error', () => res.destroy());
    result.stream.pipe(res);
  }));

  router.post('/api/fs/open', asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    await openResource(rawPath, cwd, await knownRoots(), false);
    res.json({ success: true });
  }));

  router.post('/api/fs/reveal', asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    await openResource(rawPath, cwd, await knownRoots(), true);
    res.json({ success: true });
  }));

  router.get('/api/fs/download', asyncHandler(async (req, res) => {
    const rawPath = typeof req.query.path === 'string' ? req.query.path : '';
    const cwd = typeof req.query.cwd === 'string' ? req.query.cwd : undefined;
    const result = streamResource(rawPath, cwd, await knownRoots(), req.headers.range);
    if (result.range) {
      res.status(206);
      res.setHeader('Content-Range', `bytes ${result.range.start}-${result.range.end}/${result.stat.size}`);
    }
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Content-Length', String(result.contentLength));
    res.setHeader('Content-Disposition', `attachment; filename="${result.stat.name.replace(/["\\\r\n]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', result.stat.mimeType ?? 'application/octet-stream');
    result.stream.pipe(res);
  }));

  return router;
}
