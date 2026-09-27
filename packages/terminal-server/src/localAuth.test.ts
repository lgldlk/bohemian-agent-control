import { describe, expect, it } from 'vitest';
import { authorizeConnection } from './localAuth';

const expected = 'a'.repeat(32);

describe('authorizeConnection', () => {
  it('rejects a missing or wrong token', () => {
    expect(authorizeConnection({
      token: undefined,
      expectedToken: expected,
      origin: 'http://127.0.0.1:18720',
      allowedOrigins: ['http://127.0.0.1:18720'],
    }).ok).toBe(false);
    expect(authorizeConnection({
      token: 'b'.repeat(32),
      expectedToken: expected,
      origin: undefined,
      allowedOrigins: ['http://127.0.0.1:18720'],
    }).ok).toBe(false);
  });

  it('rejects a browser origin outside the allowlist even with the token', () => {
    const verdict = authorizeConnection({
      token: expected,
      expectedToken: expected,
      origin: 'https://evil.example',
      allowedOrigins: ['http://127.0.0.1:18720'],
    });
    expect(verdict).toEqual({ ok: false, status: 403, reason: 'origin' });
  });

  it('accepts the dev origin and tokenless local tools that present the token', () => {
    expect(authorizeConnection({
      token: expected,
      expectedToken: expected,
      origin: 'http://127.0.0.1:18720',
      allowedOrigins: ['http://127.0.0.1:18720'],
    })).toEqual({ ok: true });
    expect(authorizeConnection({
      token: expected,
      expectedToken: expected,
      origin: undefined,
      allowedOrigins: ['http://127.0.0.1:18720'],
    })).toEqual({ ok: true });
  });
});
