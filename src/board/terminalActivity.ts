import { useSyncExternalStore } from 'react';
import { mergeAgentActivity, type TerminalAgentStatus, type TerminalInfo } from '@bohemian/terminal-protocol';
import { boundSessionId, processStateFromTerminalStatus, terminalIdentityKeys, terminalMatchesIdentity } from '@/domain/terminalIdentity';

export type ProcessState = 'starting' | 'running' | 'exited' | 'missing';

let infos = new Map<string, TerminalInfo>();
let inventoryLoaded = false;
let agentActivityByNode = new Map<string, TerminalAgentStatus>();
let agentActivitySnapshot = '';
let processStateByNode = new Map<string, ProcessState>();
let processStateSnapshot = '';
let attentionByNode = new Set<string>();
let attentionSnapshot = '';
let attentionInitialized = false;

const inventoryListeners = new Set<() => void>();
const agentActivityListeners = new Set<() => void>();
const processStateListeners = new Set<() => void>();
const infoListeners = new Set<() => void>();
const attentionListeners = new Set<() => void>();
const taskSyncListeners = new Set<() => void>();

export function requestTaskSync(): void {
  taskSyncListeners.forEach((listener) => listener());
}

export function subscribeTaskSync(listener: () => void): () => void {
  taskSyncListeners.add(listener);
  return () => taskSyncListeners.delete(listener);
}

function publishProcessStates(next: Map<string, ProcessState>): void {
  const snapshot = [...next.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, state]) => `${id}:${state}`).join('|');
  if (snapshot === processStateSnapshot) return;
  processStateByNode = next;
  processStateSnapshot = snapshot;
  processStateListeners.forEach((listener) => listener());
  requestTaskSync();
}

function statusOf(info: TerminalInfo): string | undefined {
  return info.agentDetail?.state ?? info.agentStatus;
}

function publishAttention(next: Set<string>): void {
  const snapshot = [...next].sort().join('|');
  if (snapshot === attentionSnapshot) return;
  attentionByNode = next;
  attentionSnapshot = snapshot;
  attentionListeners.forEach((listener) => listener());
}

export function clearBoardTaskAttention(nodeId: string): void {
  if (!nodeId) return;
  const aliases = new Set<string>([nodeId]);
  for (const info of infos.values()) {
    if (!terminalMatchesIdentity(info, nodeId)) continue;
    for (const key of terminalIdentityKeys(info)) aliases.add(key);
  }
  const next = new Set([...attentionByNode].filter((id) => !aliases.has(id)));
  if (next.size !== attentionByNode.size) publishAttention(next);
}

export function setBoardTerminalInfos(next: ReadonlyMap<string, TerminalInfo>): void {
  const previousInfos = infos;
  const nextAttention = new Set(attentionByNode);
  const nextProcessStates = new Map<string, ProcessState>();
  const activity = new Map<string, TerminalAgentStatus>();

  for (const [terminalId, current] of next) {
    const previous = previousInfos.get(terminalId);
    const keys = terminalIdentityKeys(current);
    const processState: ProcessState = processStateFromTerminalStatus(current.status);
    const runningId = processState === 'running' ? boundSessionId(current) ?? current.launchId : undefined;
    if (runningId) {
      nextProcessStates.set(runningId, 'running');
    }
    if (!runningId) for (const key of keys) nextProcessStates.set(key, processState);

    const after = statusOf(current);
    const before = previous ? statusOf(previous) : undefined;
    if (previous && attentionInitialized && (after === 'blocked' || after === 'waiting' || (after === 'done' && before !== 'done'))) {
      for (const key of keys) nextAttention.add(key);
    }

    const status = current.agentDetail?.state === 'working'
      ? 'working'
      : current.agentDetail?.state === 'blocked' || current.agentDetail?.state === 'waiting'
        ? 'blocked'
        : current.agentDetail?.state === 'done'
          ? 'idle'
          : current.agentStatus;
    if (status) for (const key of keys) activity.set(key, mergeAgentActivity(activity.get(key), status));
  }

  infos = new Map(next);
  infoListeners.forEach((listener) => listener());
  attentionInitialized = true;
  publishAttention(nextAttention);
  setBoardAgentActivity(activity);
  publishProcessStates(nextProcessStates);
}

export function setBoardInventoryLoaded(loaded: boolean): void {
  if (inventoryLoaded === loaded) return;
  inventoryLoaded = loaded;
  inventoryListeners.forEach((listener) => listener());
}

export function useBoardInventoryLoaded(): boolean {
  return useSyncExternalStore((listener) => {
    inventoryListeners.add(listener);
    return () => inventoryListeners.delete(listener);
  }, () => inventoryLoaded);
}

export function getBoardTerminalInfo(terminalId: string): TerminalInfo | undefined {
  return infos.get(terminalId);
}

export function getBoardTerminalInfos(): ReadonlyMap<string, TerminalInfo> {
  return infos;
}

export function useBoardTerminalInfo(terminalId: string): TerminalInfo | undefined {
  return useSyncExternalStore((listener) => {
    infoListeners.add(listener);
    return () => infoListeners.delete(listener);
  }, () => infos.get(terminalId));
}

export function useBoardTaskProcessState(nodeId: string): ProcessState | null {
  return useSyncExternalStore((listener) => {
    processStateListeners.add(listener);
    return () => processStateListeners.delete(listener);
  }, () => processStateByNode.get(nodeId) ?? null);
}

export function useBoardProcessStateMap(): ReadonlyMap<string, ProcessState> {
  return useSyncExternalStore((listener) => {
    processStateListeners.add(listener);
    return () => processStateListeners.delete(listener);
  }, () => processStateByNode);
}

export function setBoardAgentActivity(next: Map<string, TerminalAgentStatus>): void {
  const snapshot = [...next.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, status]) => `${id}:${status}`).join('|');
  if (snapshot === agentActivitySnapshot) return;
  agentActivityByNode = next;
  agentActivitySnapshot = snapshot;
  agentActivityListeners.forEach((listener) => listener());
}

export function useBoardAgentActivity(nodeId: string): TerminalAgentStatus | null {
  return useSyncExternalStore((listener) => {
    agentActivityListeners.add(listener);
    return () => agentActivityListeners.delete(listener);
  }, () => agentActivityByNode.get(nodeId) ?? null);
}

export function useBoardAgentActivityMap(): ReadonlyMap<string, TerminalAgentStatus> {
  return useSyncExternalStore((listener) => {
    agentActivityListeners.add(listener);
    return () => agentActivityListeners.delete(listener);
  }, () => agentActivityByNode);
}

export function useBoardTaskAttention(nodeId: string): boolean {
  return useSyncExternalStore((listener) => {
    attentionListeners.add(listener);
    return () => attentionListeners.delete(listener);
  }, () => attentionByNode.has(nodeId));
}

export function useBoardAttentionCount(): number {
  return useSyncExternalStore((listener) => {
    attentionListeners.add(listener);
    return () => attentionListeners.delete(listener);
  }, () => attentionByNode.size);
}
