import { useSyncExternalStore } from 'react';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

const revisions = new Map<string, number>();
const forcedKeys = new Set<string>();
const listeners = new Map<string, Set<() => void>>();

export function resourceRefreshKey(resource: TerminalResourceRef): string {
  return resource.kind === 'remote-url'
    ? `${resource.kind}:${resource.url ?? resource.persistentUrl ?? resource.raw}`
    : `${resource.kind}:${resource.path ?? resource.raw}:${resource.cwd}`;
}

export function refreshResource(resource: TerminalResourceRef): void {
  const key = resourceRefreshKey(resource);
  forcedKeys.add(key);
  revisions.set(key, (revisions.get(key) ?? 0) + 1);
  for (const listener of [...(listeners.get(key) ?? [])]) listener();
}

export function isResourceRefreshForced(resource: TerminalResourceRef): boolean {
  return forcedKeys.has(resourceRefreshKey(resource));
}

export function useResourceRefreshRevision(resource: TerminalResourceRef): number {
  const key = resourceRefreshKey(resource);
  return useSyncExternalStore(
    (listener) => {
      const set = listeners.get(key) ?? new Set<() => void>();
      set.add(listener);
      listeners.set(key, set);
      return () => {
        set.delete(listener);
        if (set.size === 0) listeners.delete(key);
      };
    },
    () => revisions.get(key) ?? 0,
    () => 0,
  );
}
