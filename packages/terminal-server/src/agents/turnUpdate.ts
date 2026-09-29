import { claudeScreenPhase } from './claude/sessions';
import { codexScreenPhase } from './codex/sessions';
import type { TurnCursor } from './journal';

export interface ObservedTurn {
  state: 'working' | 'done';
  status: 'working' | 'idle';
  observedAt: number;
}

/** Screen text is only a fallback. A hook wait is not overwritten by a spinner. */
export function screenTurnUpdate(
  agentKind: string | undefined,
  data: string,
  current?: { origin?: string; state?: string },
): ObservedTurn | null {
  const phase = agentKind === 'codex'
    ? codexScreenPhase(data)
    : agentKind === 'claude-code'
      ? claudeScreenPhase(data)
      : null;
  if (!phase) return null;
  if (phase === 'working' && current?.origin === 'hook' && (current.state === 'waiting' || current.state === 'blocked')) {
    return null;
  }
  return {
    state: phase === 'working' ? 'working' : 'done',
    status: phase === 'working' ? 'working' : 'idle',
    observedAt: Date.now(),
  };
}

/** A newer completed observation must not be reopened by an older journal line. */
export function journalTurnUpdate(
  cursor: TurnCursor,
  current?: { origin?: string; state?: string; observedAt?: number },
): ObservedTurn | null {
  if (cursor.phase === 'idle') return null;
  const state = cursor.phase === 'working' ? 'working' : 'done';
  const observedAt = cursor.observedAt || Date.now();
  if (state === 'working' && current?.state === 'done' && (current.observedAt ?? 0) > observedAt) return null;
  if (current?.origin === 'journal' && current.state === state && current.observedAt === observedAt) return null;
  return { state, status: state === 'working' ? 'working' : 'idle', observedAt };
}
