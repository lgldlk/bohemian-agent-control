import { create } from 'zustand';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';

const KEY = 'bohemian-agent-control:board-layout:v1';

export const DEFAULT_AGENTS_PER_ROW = 3;
export const MIN_AGENTS_PER_ROW = 1;
export const MAX_AGENTS_PER_ROW = 8;

export function normalizeAgentsPerRow(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_AGENTS_PER_ROW;
  return Math.min(MAX_AGENTS_PER_ROW, Math.max(MIN_AGENTS_PER_ROW, Math.round(parsed)));
}

interface BoardLayoutState {
  agentsPerRow: number;
  setAgentsPerRow: (value: number) => void;
}

function load(): number {
  return readLocalJson(KEY, (value) => {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    return normalizeAgentsPerRow((value as { agentsPerRow?: unknown }).agentsPerRow);
  }, () => DEFAULT_AGENTS_PER_ROW);
}

export const useBoardLayoutStore = create<BoardLayoutState>()((set) => ({
  agentsPerRow: load(),
  setAgentsPerRow: (value) => {
    const agentsPerRow = normalizeAgentsPerRow(value);
    set({ agentsPerRow });
    writeLocalJson(KEY, { agentsPerRow });
  },
}));
