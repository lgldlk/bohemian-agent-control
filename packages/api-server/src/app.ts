import express, { type Application } from 'express';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentRegistry } from './agents';
import type { Logger } from './log';
import { apiAuth } from './localAuth';
import { SnapshotClock } from './snapshot';
import { errorMiddleware } from './http/errors';
import { healthRouter } from './http/routes/health';
import { sessionsRouter } from './http/routes/sessions';
import { fsRouter } from './http/routes/fs';
import { resourcesRouter } from './http/routes/resources';
import { pluginsRouter } from './http/routes/plugins';
import { UserPluginManager } from './plugins';

export interface CreateAppOptions {
  token?: string;
  allowedOrigins?: readonly string[];
  pluginRoot?: string;
  pluginManager?: UserPluginManager;
}

export function createApp(
  registry: AgentRegistry,
  log: Logger,
  options: CreateAppOptions = {},
): Application {
  const app = express();
  const snapshot = new SnapshotClock();
  app.disable('x-powered-by');
  if (options.token) app.use(apiAuth(options.token, options.allowedOrigins));
  app.use(healthRouter(registry));
  app.use(sessionsRouter(registry, snapshot));
  app.use(fsRouter());
  app.use(resourcesRouter(registry));
  app.use(pluginsRouter(options.pluginManager ?? new UserPluginManager(
    options.pluginRoot ?? path.join(os.homedir(), '.bohemian-agent-control', 'plugins'),
  )));
  app.use(errorMiddleware(log));
  return app;
}
