import { describe, expect, it } from 'vitest';
import { selectPiLaunchSession } from './ptyAgent';

describe('selectPiLaunchSession', () => {
  const createdAt = Date.parse('2026-09-26T14:08:38.833Z');

  it('binds the session created with the PTY, ignoring older files and later siblings', () => {
    expect(selectPiLaunchSession([
      { id: 'old', startedAt: createdAt - 60_000 },
      { id: 'launch', startedAt: createdAt + 373 },
      { id: 'sibling', startedAt: createdAt + 60_000 },
    ], createdAt)).toBe('launch');
  });

  it('does not reuse a session already claimed by an earlier terminal', () => {
    const sessions = [
      { id: 'first', startedAt: createdAt + 1_000 },
      { id: 'second', startedAt: createdAt + 2_000 },
    ];
    const claimed = new Set<string>();
    const first = selectPiLaunchSession(sessions, createdAt, claimed);
    claimed.add(first!);
    expect(selectPiLaunchSession(sessions, createdAt + 1_500, claimed)).toBe('second');
  });
});
