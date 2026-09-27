import type { Application } from 'express';
import type { Server } from 'node:http';
import { loadConfig } from './config';
import { createLogger } from './log';
import { createDefaultRegistry } from './agents';
import { createApp } from './app';
import { apiTokenPath, ensureApiToken } from './localAuth';

export { createApp } from './app';
export { loadConfig } from './config';
export { createDefaultRegistry } from './agents';

export function startApiServer(): {
  app: Application;
  server: Server;
  config: ReturnType<typeof loadConfig>;
  registry: ReturnType<typeof createDefaultRegistry>;
} {
  const config = loadConfig();
  const log = createLogger('api', config.logLevel);
  const registry = createDefaultRegistry(config);
  const token = ensureApiToken();
  const app = createApp(registry, log, { token });
  const server = app.listen(config.port, config.host, () => {
    log.info(`listening on http://${config.host}:${config.port}`);
    log.info(`api token file ${apiTokenPath()}`);
  });

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    registry.close();
    server.close(() => process.exit(0));
    // Do not let a stuck SDK/child process keep a dev restart alive forever.
    const fallback = setTimeout(() => process.exit(0), 1500);
    fallback.unref();
  };
  process.once('SIGTERM', close);
  process.once('SIGINT', close);

  return { app, server, config, registry };
}

startApiServer();
