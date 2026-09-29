import { useSyncExternalStore } from 'react';

type ActiveBoardPlugin = readonly [pluginId: string, panelId: string];

let activeId: string | null = null;
let activePageId: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

export function toggleBoardPlugin(id: string): void {
  activeId = activeId === id ? null : id;
  if (activeId !== null) activePageId = null;
  emit();
}

export function boardPluginPanelKey(pluginId: string, panelId: string): string {
  return JSON.stringify([pluginId, panelId]);
}

export function parseBoardPluginPanelKey(value: string | null): ActiveBoardPlugin | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length !== 2) return null;
    const pluginId = parsed[0];
    const panelId = parsed[1];
    if (typeof pluginId !== 'string' || typeof panelId !== 'string') return null;
    return [pluginId, panelId];
  } catch {
    return null;
  }
}

export function closeBoardPlugin(): void {
  if (activeId === null) return;
  activeId = null;
  emit();
}

export function openBoardPluginPage(id: string): void {
  if (activePageId === id && activeId === null) return;
  activePageId = id;
  activeId = null;
  emit();
}

export function closeBoardPluginPage(): void {
  if (activePageId === null) return;
  activePageId = null;
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveBoardPluginId(): string | null {
  return activeId;
}

export function getActiveBoardPluginPageId(): string | null {
  return activePageId;
}

export function useActiveBoardPluginId(): string | null {
  return useSyncExternalStore(subscribe, getActiveBoardPluginId);
}

export function useActiveBoardPluginPageId(): string | null {
  return useSyncExternalStore(subscribe, getActiveBoardPluginPageId);
}

export function resetBoardPluginUiForTests(): void {
  activeId = null;
  activePageId = null;
  emit();
}
