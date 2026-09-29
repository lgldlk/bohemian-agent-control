export const LAUNCH_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface SessionHeader {
  id: string;
  startedAt: number;
}

/** The session created by this PTY, not a later sibling and not the newest file mtime. */
export function selectLaunchSession(
  sessions: readonly SessionHeader[],
  createdAt: number,
  claimed?: ReadonlySet<string>,
): string | undefined {
  return sessions
    .filter((session) =>
      !claimed?.has(session.id) &&
      session.startedAt >= createdAt - 5_000 &&
      session.startedAt <= createdAt + LAUNCH_MATCH_WINDOW_MS,
    )
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))[0]?.id;
}
