import express, { type Application } from 'express';
import type { AgentRegistry } from './agents';
import type { Logger } from './log';
import { apiAuth } from './localAuth';
import { SnapshotClock } from './snapshot';
import { errorMiddleware } from './http/errors';
import { healthRouter } from './http/routes/health';
import { sessionsRouter } from './http/routes/sessions';
import { fsRouter } from './http/routes/fs';

export function createApp(
  registry: AgentRegistry,
  log: Logger,
  options: { token?: string; allowedOrigins?: readonly string[] } = {},
): Application {
  const app = express();
  const snapshot = new SnapshotClock();
  app.disable('x-powered-by');
  if (options.token) app.use(apiAuth(options.token, options.allowedOrigins));
  app.use(healthRouter(registry));
  app.use(sessionsRouter(registry, snapshot));
  app.use(fsRouter());
  app.use(errorMiddleware(log));
  return app;
}
