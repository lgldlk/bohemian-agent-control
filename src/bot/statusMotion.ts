import type { BoardAgentStatus } from '@/lib/boardStatus';
import { EXPRESSION_BY_ID, type BotExpression, type ExpressionId } from './expressions';
import type { StateId } from './states';

export interface StatusMotion {
  state: StateId;
  expression: BotExpression | null;
  weight: number;
}

function motion(state: StateId, expressionId: ExpressionId, weight: number): StatusMotion {
  return {
    state,
    expression: EXPRESSION_BY_ID.get(expressionId) ?? null,
    weight,
  };
}

function keyOf(item: StatusMotion): string {
  return `${item.state}:${item.expression?.id ?? ''}`;
}

/**
 * Only cloud-body states (`baseBody: true`): idle, wink, wide, notify, swirl.
 * Variety comes from expression + which of those motions play.
 */
export const STATUS_MOTION: Record<BoardAgentStatus, StatusMotion[]> = {
  working: [
    motion('swirl', 'attentif', 8),
    motion('swirl', 'excite', 5),
    motion('swirl', 'curieux', 3),
    motion('wide', 'attentif', 2),
    motion('notify', 'fier', 1),
  ],
  starting: [
    motion('idle', 'attentif', 6),
    motion('wink', 'curieux', 4),
    motion('swirl', 'attentif', 3),
    motion('wide', 'timide', 2),
  ],
  running: [
    motion('idle', 'attentif', 7),
    motion('wink', 'neutre', 4),
    motion('wide', 'curieux', 2),
  ],
  blocked: [
    motion('notify', 'confus', 6),
    motion('wide', 'mefiant', 4),
    motion('wide', 'surpris', 3),
    motion('idle', 'confus', 2),
  ],
  idle: [
    motion('idle', 'neutre', 8),
    motion('wink', 'blase', 4),
    motion('idle', 'somnolent', 3),
    motion('idle', 'curieux', 2),
    motion('wink', 'neutre', 2),
  ],
  pending: [
    motion('idle', 'confus', 6),
    motion('wink', 'timide', 3),
    motion('wide', 'curieux', 2),
    motion('idle', 'attentif', 2),
  ],
  completed: [
    motion('idle', 'heureux', 7),
    motion('wink', 'fier', 4),
    motion('idle', 'hilare', 2),
    motion('wink', 'heureux', 2),
  ],
  deleted: [
    motion('idle', 'triste', 6),
    motion('idle', 'blase', 4),
    motion('wide', 'confus', 2),
  ],
  error: [
    motion('wide', 'colere', 6),
    motion('notify', 'colere', 3),
    motion('idle', 'triste', 3),
    motion('wide', 'effraye', 2),
  ],
  unknown: [
    motion('idle', 'neutre', 8),
    motion('wink', 'blase', 3),
    motion('idle', 'confus', 1),
  ],
};

export function pickStatusMotion(status: BoardAgentStatus, avoid?: StatusMotion): StatusMotion {
  const pool = STATUS_MOTION[status];
  const skip = avoid ? keyOf(avoid) : '';
  const choices = skip && pool.some((item) => keyOf(item) !== skip)
    ? pool.filter((item) => keyOf(item) !== skip)
    : pool;
  const total = choices.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of choices) {
    cursor -= item.weight;
    if (cursor <= 0) return item;
  }
  return choices[choices.length - 1] ?? pool[0];
}

export function motionHold(picked: StatusMotion): number {
  const jitter = 0.8 + Math.random() * 0.5;
  if (picked.state === 'swirl') return 3.4 * jitter;
  if (picked.state === 'idle') return 3.0 * jitter;
  return 2.2 * jitter;
}
