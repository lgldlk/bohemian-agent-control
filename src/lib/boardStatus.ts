import type { TerminalAgentStatus } from '@bohemian/terminal-protocol';
import type { ProcessState } from '@/board/terminalActivity';

/** TUI activity from OSC or a provider hook. Not process liveness. */
export type AgentActivity = TerminalAgentStatus;

export type ProcessAxis = 'starting' | 'live' | 'exited' | 'missing' | 'unknown';
export type ActivityAxis = 'working' | 'blocked' | 'idle' | 'unknown';
export type RecordAxis = 'pending' | 'running' | 'completed' | 'deleted' | 'error' | 'unknown';
export type TerminalPresence = 'starting' | 'open' | 'stopped' | 'missing' | 'none';

/**
 * The only status the icon may animate.
 * `running` is process-live. It is not TUI working.
 */
export type BoardAgentStatus =
  | 'working'
  | 'blocked'
  | 'idle'
  | 'starting'
  | 'running'
  | 'pending'
  | 'completed'
  | 'deleted'
  | 'error'
  | 'unknown';

export interface StatusAxes {
  process: ProcessAxis;
  activity: ActivityAxis;
  record: RecordAxis;
}

const BOARD_STATUSES = new Set<BoardAgentStatus>([
  'working',
  'blocked',
  'idle',
  'starting',
  'running',
  'pending',
  'completed',
  'deleted',
  'error',
  'unknown',
]);

export function isBoardAgentStatus(value: string): value is BoardAgentStatus {
  return BOARD_STATUSES.has(value as BoardAgentStatus);
}

export interface AgentPhaseInput {
  processState?: ProcessState | null;
  activity?: AgentActivity | null;
  record?: string | null;
}

export function resolveStatusAxes(input: AgentPhaseInput): StatusAxes {
  return {
    process: processAxis(input.processState),
    activity: activityAxis(input.activity),
    record: recordAxis(input.record),
  };
}

/** Task lamp. An open terminal is not a running task. */
export function iconStatus(axes: StatusAxes): BoardAgentStatus {
  if (axes.record === 'deleted') return 'deleted';
  if (axes.activity === 'blocked') return 'blocked';
  if (axes.activity === 'working') return 'running';
  if (axes.process === 'starting') return 'starting';
  if (axes.activity === 'idle' || axes.process === 'live') return 'idle';
  if (axes.process === 'exited' || axes.process === 'missing') {
    return axes.record === 'error' ? 'error' : 'completed';
  }
  if (axes.record === 'pending') return 'pending';
  if (axes.record === 'error') return 'error';
  if (axes.record === 'completed') return 'completed';
  return 'unknown';
}

export function terminalPresence(process: ProcessAxis): TerminalPresence {
  if (process === 'starting') return 'starting';
  if (process === 'live') return 'open';
  if (process === 'exited') return 'stopped';
  if (process === 'missing') return 'missing';
  return 'none';
}

export interface CardStatus {
  axes: StatusAxes;
  /** What the agent/task is doing. */
  task: BoardAgentStatus;
  /** Whether this card's own terminal process is up. */
  terminal: TerminalPresence;
  /** Card chrome may pulse. Never true just because a terminal is open. */
  active: boolean;
}

/** The only join of session record, agent activity, and terminal process. */
export function projectCardStatus(input: AgentPhaseInput): CardStatus {
  const axes = resolveStatusAxes(input);
  const task = iconStatus(axes);
  return {
    axes,
    task,
    terminal: terminalPresence(axes.process),
    active: task === 'running' || task === 'blocked' || task === 'starting',
  };
}

export function isActivePhase(status: BoardAgentStatus): boolean {
  return status === 'running' || status === 'blocked' || status === 'starting';
}

function processAxis(state: ProcessState | null | undefined): ProcessAxis {
  if (state === 'starting') return 'starting';
  if (state === 'running') return 'live';
  if (state === 'exited') return 'exited';
  if (state === 'missing') return 'missing';
  return 'unknown';
}

function activityAxis(activity: AgentActivity | null | undefined): ActivityAxis {
  if (activity === 'working' || activity === 'blocked' || activity === 'idle') return activity;
  return 'unknown';
}

function recordAxis(record: string | null | undefined): RecordAxis {
  if (
    record === 'pending'
    || record === 'running'
    || record === 'completed'
    || record === 'deleted'
    || record === 'error'
  ) return record;
  return 'unknown';
}
