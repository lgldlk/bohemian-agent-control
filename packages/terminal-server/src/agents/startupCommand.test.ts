import { describe, expect, it } from 'vitest';
import { providerResumeCommand, providerStartupCommand } from './startupCommand';

describe('providerResumeCommand', () => {
  it('resumes the bound Codex conversation', () => {
    expect(providerResumeCommand('codex', 'thread-123')).toBe("codex resume 'thread-123'");
  });

  it('builds the provider-specific resume command', () => {
    expect(providerResumeCommand('claude-code', 'claude-1')).toBe("claude --resume 'claude-1'");
    expect(providerResumeCommand('pi', 'pi-1')).toBe("pi --session 'pi-1'");
  });

  it('starts Pi in fullscreen TUI mode so its scroll view owns wheel history', () => {
    expect(providerStartupCommand('pi', 'pi --offline', {})).toBe('pi --offline --tui-mode fullscreen');
    expect(providerStartupCommand('pi', 'pi --tui-mode regular', {})).toBe('pi --tui-mode regular');
  });

  it('does not add Pi flags to a non-Pi recovery command', () => {
    expect(providerStartupCommand('pi', 'sleep 30', {})).toBe('sleep 30');
  });

  it('quotes session ids and rejects pending launch ids', () => {
    expect(providerResumeCommand('codex', "thread'quoted")).toBe("codex resume 'thread'\"'\"'quoted'");
    expect(providerResumeCommand('codex', 'pending-123')).toBeUndefined();
    expect(providerResumeCommand(undefined, 'thread-123')).toBeUndefined();
  });
});
