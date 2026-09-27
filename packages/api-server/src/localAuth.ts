import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { NextFunction, Request, Response } from 'express';

export const API_TOKEN_FILE = 'api.token';

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:18720',
  'http://localhost:18720',
];

function controlStateDir(): string {
  return path.join(os.homedir(), '.bohemian-agent-control');
}

export function apiTokenPath(): string {
  return path.join(controlStateDir(), API_TOKEN_FILE);
}

export function ensureApiToken(): string {
  const dir = controlStateDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = apiTokenPath();
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Create below.
  }
  const token = randomBytes(32).toString('hex');
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* created with mode */ }
  return token;
}

export function tokensMatch(expected: string, presented: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function presentedToken(req: Request): string | undefined {
  const header = req.header('x-bohemian-token');
  if (header) return header;
  return typeof req.query.token === 'string' ? req.query.token : undefined;
}

/** Loopback API guard. Health stays open so a liveness probe does not need the secret. */
export function apiAuth(token: string, allowedOrigins: readonly string[] = DEFAULT_ALLOWED_ORIGINS) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/api/health') {
      next();
      return;
    }
    if (!tokensMatch(token, presentedToken(req))) {
      res.status(401).json({ success: false, error: 'unauthorized', code: 'unauthorized' });
      return;
    }
    const origin = req.header('origin');
    if (origin && !allowedOrigins.includes(origin)) {
      res.status(403).json({ success: false, error: 'origin', code: 'origin' });
      return;
    }
    next();
  };
}
