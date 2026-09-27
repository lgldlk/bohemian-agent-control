import { create } from 'zustand';
import type { Task } from '@/types';
import i18n from '@/i18n';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';

export interface PendingThread {
  id: string;
  cwd: string;
  createdAt: number;
  agentKind?: string;
}

interface WorkspaceState {
  lastUsed: string;
  favorites: string[];
  pending: PendingThread[];
  setLastUsed: (path: string) => void;
  toggleFavorite: (path: string) => void;
  addPending: (cwd: string, agentKind?: string) => PendingThread;
  removePending: (id: string) => void;
}

const KEY = 'bohemian-agent-control:workspace:v1';

function load(): Pick<WorkspaceState, 'lastUsed' | 'favorites'> {
  return readLocalJson(KEY, (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const parsed = value as Record<string, unknown>;
    return {
      lastUsed: typeof parsed.lastUsed === 'string' ? parsed.lastUsed : '',
      favorites: Array.isArray(parsed.favorites)
        ? parsed.favorites.filter((x) => typeof x === 'string')
        : [],
    };
  }, () => ({ lastUsed: '', favorites: [] }));
}

function save(s: Pick<WorkspaceState, 'lastUsed' | 'favorites'>) {
  writeLocalJson(KEY, { lastUsed: s.lastUsed, favorites: s.favorites });
}

function folderName(cwd: string): string {
  return cwd.split('/').filter(Boolean).pop() || cwd || 'workspace';
}

/** 占位会话:真正的 agent 会话还没落盘,先在画板上占一张卡 */
export function pendingToTask(p: PendingThread): Task {
  const project = folderName(p.cwd);
  const now = new Date(p.createdAt);
  return {
    id: p.id,
    name: i18n.t('thread.newName', { project }),
    fullText: '',
    project,
    workingDir: p.cwd,
    agentKind: p.agentKind,
    status: 'pending',
    model: 'unknown',
    provider: '',
    progress: -1,
    startTime: now,
    lastActivity: now,
    size: 30,
    messageCount: 0,
    toolCalls: 0,
    tools: [],
    openUrl: '',
  };
}

export const useWorkspaceStore = create<WorkspaceState>()((set, get) => ({
  ...load(),
  pending: [],

  setLastUsed: (path) => {
    const next = { lastUsed: path, favorites: get().favorites };
    set(next);
    save(next);
  },

  toggleFavorite: (path) => {
    const cur = get().favorites;
    const favorites = cur.includes(path) ? cur.filter((p) => p !== path) : [...cur, path];
    const next = { lastUsed: get().lastUsed, favorites };
    set(next);
    save(next);
  },

  addPending: (cwd, agentKind) => {
    const thread: PendingThread = {
      id: `pending-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      cwd,
      createdAt: Date.now(),
      agentKind,
    };
    set({ pending: [...get().pending, thread] });
    return thread;
  },

  removePending: (id) => {
    set({ pending: get().pending.filter((p) => p.id !== id) });
  },
}));
