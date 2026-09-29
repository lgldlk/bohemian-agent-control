import { describe, expect, it } from 'vitest';
import { injectCodexHome } from './startup';

describe('injectCodexHome', () => {
  it('runs managed Codex terminals without the app-server daemon', () => {
    expect(injectCodexHome("codex resume 'thread-123'", '/runtime/codex-home')).toBe(
      "env CODEX_HOME='/runtime/codex-home' codex --no-daemon resume 'thread-123'",
    );
    expect(injectCodexHome('codex', '/runtime/codex-home')).toBe(
      "env CODEX_HOME='/runtime/codex-home' codex --no-daemon",
    );
  });

  it('does not duplicate an explicit no-daemon flag', () => {
    expect(injectCodexHome('codex --no-daemon resume thread-123', '/runtime/codex-home')).toBe(
      "env CODEX_HOME='/runtime/codex-home' codex --no-daemon resume thread-123",
    );
  });

  it('leaves commands with an explicit Codex home unchanged', () => {
    expect(injectCodexHome('CODEX_HOME=/custom codex resume thread-123', '/runtime/codex-home')).toBeUndefined();
  });
});
