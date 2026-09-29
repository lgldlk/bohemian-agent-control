import * as path from 'node:path';
import { json, Router, type Router as RouterType } from 'express';
import { asyncHandler, HttpError } from '../errors';
import { UserPluginManager } from '../../plugins';

const BODY_LIMIT = '16kb';

function pluginFileUrl(id: string, filePath: string): string {
  return `/api/plugins/${encodeURIComponent(id)}/files/${filePath.split('/').map(encodeURIComponent).join('/')}`;
}

function pluginDto(plugin: Awaited<ReturnType<UserPluginManager['list']>>[number]) {
  return {
    ...plugin,
    entryUrl: pluginFileUrl(plugin.id, plugin.manifest.entry),
  };
}

function pluginContentType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.js':
    case '.mjs': return 'text/javascript; charset=utf-8';
    case '.json': return 'application/json; charset=utf-8';
    case '.css': return 'text/css; charset=utf-8';
    case '.svg': return 'image/svg+xml';
    case '.png': return 'image/png';
    case '.jpg':
    case '.jpeg': return 'image/jpeg';
    case '.webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

export function pluginsRouter(manager: UserPluginManager): RouterType {
  const router = Router();

  router.get('/api/plugins', asyncHandler(async (_req, res) => {
    const plugins = await manager.list();
    res.json({
      success: true,
      storageRoot: manager.root,
      plugins: plugins.map(pluginDto),
    });
  }));

  router.post(
    '/api/plugins/install-github',
    json({ limit: BODY_LIMIT }),
    asyncHandler(async (req, res) => {
      const url = typeof req.body?.url === 'string' ? req.body.url : '';
      if (req.body?.trusted !== true) {
        throw new HttpError(400, 'Installing a plugin requires explicit trust confirmation', 'plugin_trust_required');
      }
      const plugin = await manager.installFromGitHub(url);
      res.status(201).json({ success: true, plugin: pluginDto(plugin), reloadRequired: true });
    }),
  );

  router.patch(
    '/api/plugins/:id',
    json({ limit: BODY_LIMIT }),
    asyncHandler(async (req, res) => {
      if (typeof req.body?.enabled !== 'boolean') {
        throw new HttpError(400, 'enabled must be a boolean', 'invalid_plugin_state');
      }
      const plugin = await manager.setEnabled(req.params.id, req.body.enabled);
      res.json({ success: true, plugin: pluginDto(plugin), reloadRequired: true });
    }),
  );

  router.delete('/api/plugins/:id', asyncHandler(async (req, res) => {
    await manager.remove(req.params.id);
    res.json({ success: true, reloadRequired: true });
  }));

  router.get('/api/plugins/:id/files/*', asyncHandler(async (req, res) => {
    const requestedPath = String(req.params[0] ?? '');
    const filePath = await manager.resolveFile(req.params.id, requestedPath);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Type', pluginContentType(filePath));
    res.sendFile(filePath);
  }));

  return router;
}
