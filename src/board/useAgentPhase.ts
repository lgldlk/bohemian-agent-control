import { useBoardAgentActivity, useBoardTaskProcessState } from '@/board/terminalActivity';
import { projectCardStatus, type CardStatus } from '@/lib/boardStatus';

/** Card view for one agent. Terminal liveness comes only from that agent's PTY. */
export function useAgentPhase(nodeId: string, record?: string | null): CardStatus {
  const activity = useBoardAgentActivity(nodeId);
  const processState = useBoardTaskProcessState(nodeId);
  return projectCardStatus({ processState, activity, record });
}
