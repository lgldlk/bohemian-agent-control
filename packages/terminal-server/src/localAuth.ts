import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:18720',
  'http://localhost:18720',
];

export function controlStateDir(): string {
  return path.join(os.homedir(), '.bohemian-agent-control');
}

export function localTokenPath(fileName: string): string {
  return path.join(controlStateDir(), fileName);
}

/** Stable loopback secret. The value stays in a 0600 file and is never logged. */
export function ensureLocalToken(fileName: string): string {
  const dir = controlStateDir();
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = localTokenPath(fileName);
  try {
    const existing = fs.readFileSync(file, 'utf8').trim();
    if (existing.length >= 32) return existing;
  } catch {
    // Create below.
  }
  const token = randomBytes(32).toString('hex');
  fs.writeFileSync(file, `${token}\n`, { mode: 0o600 });
  try { fs.chmodSync(file, 0o600); } catch { /* already created with mode */ }
  return token;
}

export function readLocalToken(fileName: string): string {
  try {
    return fs.readFileSync(localTokenPath(fileName), 'utf8').trim();
  } catch {
    return '';
  }
}

export function tokensMatch(expected: string, presented: string | undefined): boolean {
  if (!expected || !presented) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(presented);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function authorizeConnection(input: {
  token: string | undefined;
  expectedToken: string;
  origin: string | undefined;
  allowedOrigins: readonly string[];
}): { ok: true } | { ok: false; status: number; reason: string } {
  if (!tokensMatch(input.expectedToken, input.token)) {
    return { ok: false, status: 401, reason: 'unauthorized' };
  }
  const origin = input.origin?.trim();
  if (origin && !input.allowedOrigins.includes(origin)) {
    return { ok: false, status: 403, reason: 'origin' };
  }
  return { ok: true };
}

export function tokenFromUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url, 'http://127.0.0.1').searchParams.get('token') ?? undefined;
  } catch {
    return undefined;
  }
}

export function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
