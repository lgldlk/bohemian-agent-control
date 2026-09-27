import { createServer } from 'node:http';
import express from 'express';
import { afterEach, describe, expect, it } from 'vitest';
import { apiAuth } from './localAuth';

const TOKEN = 'api-token-api-token-api-token-ok';
const servers: Array<{ close: (cb: () => void) => void }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

describe('apiAuth', () => {
  it('leaves health open and requires the token everywhere else', async () => {
    const base = await listen();
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/sessions`)).status).toBe(401);
    expect((await fetch(`${base}/api/dir`)).status).toBe(401);
    const allowed = await fetch(`${base}/api/sessions`, { headers: { 'x-bohemian-token': TOKEN } });
    expect(allowed.status).toBe(200);
    const foreign = await fetch(`${base}/api/sessions`, {
      headers: { 'x-bohemian-token': TOKEN, origin: 'https://evil.example' },
    });
    expect(foreign.status).toBe(403);
  });
});

async function listen(): Promise<string> {
  const app = express();
  app.use(apiAuth(TOKEN));
  app.get('/api/health', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/sessions', (_req, res) => { res.json({ ok: true }); });
  app.get('/api/dir', (_req, res) => { res.json({ ok: true }); });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('no port');
  return `http://127.0.0.1:${address.port}`;
}
