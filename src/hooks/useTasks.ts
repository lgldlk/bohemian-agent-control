import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createDebouncedTask } from '@/lib/timing';
import { fetchWithTransientRetry } from '@/lib/httpRetry';
import { parseControlTask } from '@bohemian/agent-protocol';
import type { Task } from '@/types';
import { subscribeTaskSync } from '@/board/terminalActivity';
import {
  loadDeletedTasks,
  mergeTaskSnapshot,
  saveDeletedTasks,
} from '@/domain/taskReconciliation';

const DIGEST_MS = 5000;

interface DigestEntry {
  id: string;
  modified: string | null;
  messageCount: number;
  tokenCount?: number;
  status?: string;
}

function toTask(raw: unknown): Task {
  const task = parseControlTask(raw);
  return {
    ...task,
    startTime: new Date(task.startTime),
    lastActivity: new Date(task.lastActivity),
  };
}

/** Owns API polling, task snapshot reconciliation and deleted-agent persistence. */
export function useTasks() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [changedIds, setChangedIds] = useState<string[]>([]);
  const tasksRef = useRef<Task[]>([]);
  const tombstonesRef = useRef<Task[]>(loadDeletedTasks());
  const revRef = useRef<number>(0);
  const prevDigestRef = useRef<Map<string, string>>(new Map());
  const requestRef = useRef<{ controller: AbortController; generation: number } | null>(null);
  const requestGenerationRef = useRef(0);
  const changedReset = useMemo(() => createDebouncedTask(4000), []);

  const beginRequest = useCallback(() => {
    requestRef.current?.controller.abort();
    const request = {
      controller: new AbortController(),
      generation: requestGenerationRef.current + 1,
    };
    requestGenerationRef.current = request.generation;
    requestRef.current = request;
    return request;
  }, []);

  const isCurrentRequest = useCallback((generation: number) =>
    requestRef.current?.generation === generation, []);

  const publish = useCallback((next: Task[], changed: string[] = []) => {
    tasksRef.current = next;
    const tombstones = next.filter((task) => task.status === 'deleted');
    tombstonesRef.current = tombstones;
    saveDeletedTasks(tombstones);
    setTasks(next);
    setChangedIds(changed);
  }, []);

  const fetchFull = useCallback(async (changed: Set<string> | null) => {
    const request = beginRequest();
    try {
      const response = await fetchWithTransientRetry('/api/sessions', { signal: request.controller.signal });
      if (!response.ok) throw new Error(`Failed to load tasks (${response.status})`);
      const data: unknown = await response.json();
      if (!isCurrentRequest(request.generation)) return;
      if (!isRecord(data) || data.success !== true || !Array.isArray(data.tasks) || typeof data.rev !== 'number') {
        throw new Error(isRecord(data) && typeof data.error === 'string' ? data.error : 'Invalid tasks response');
      }
      revRef.current = data.rev;

      const fresh: Task[] = data.tasks.map(toTask);
      const previous = tasksRef.current.length > 0 ? tasksRef.current : tombstonesRef.current;
      const next = mergeTaskSnapshot(previous, fresh, changed);
      const liveIds = new Set(fresh.map((task) => task.id));
      if (previous.length === 0) {
        for (const tombstone of tombstonesRef.current) {
          if (!liveIds.has(tombstone.id) && !next.some((task) => task.id === tombstone.id)) next.push(tombstone);
        }
      }

      const digest = new Map<string, string>();
      for (const task of fresh) digest.set(task.id, digestKey(task));
      prevDigestRef.current = digest;
      publish(next, changed ? [...changed] : []);
      if (changed) changedReset.schedule(() => setChangedIds([]));
      setLastUpdate(new Date());
      setError(null);
    } finally {
      if (isCurrentRequest(request.generation)) requestRef.current = null;
    }
  }, [beginRequest, changedReset, isCurrentRequest, publish]);

  const refresh = useCallback(async () => {
    try {
      await fetchFull(null);
    } catch (err) {
      if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [fetchFull]);

  useEffect(() => {
    const refreshTask = createDebouncedTask(250);
    const unsubscribe = subscribeTaskSync(() => {
      refreshTask.schedule(() => {
        void fetchFull(null).catch((err) => {
          if (!isAbortError(err)) setError(err instanceof Error ? err.message : 'Unknown error');
        });
      });
    });
    return () => {
      unsubscribe();
      refreshTask.cancel();
    };
  }, [fetchFull]);

  useEffect(() => () => changedReset.cancel(), [changedReset]);
  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.hidden) return;
      try {
        if (revRef.current === 0) {
          await fetchFull(null);
          return;
        }
        const request = beginRequest();
        const response = await fetchWithTransientRetry('/api/digest', { signal: request.controller.signal });
        if (!response.ok) throw new Error(`Failed to load task digest (${response.status})`);
        const digest: unknown = await response.json();
        if (!isCurrentRequest(request.generation)) return;
        if (!isRecord(digest) || digest.success !== true || !Array.isArray(digest.sessions) || typeof digest.rev !== 'number') {
          throw new Error(isRecord(digest) && typeof digest.error === 'string' ? digest.error : 'Invalid task digest');
        }
        if (stopped) return;
        if (digest.rev === revRef.current) {
          if (isCurrentRequest(request.generation)) requestRef.current = null;
          return;
        }

        const previous = prevDigestRef.current;
        const changed = new Set<string>();
        const seen = new Set<string>();
        for (const entry of (digest.sessions ?? []) as DigestEntry[]) {
          seen.add(entry.id);
          const key = `${entry.modified ?? ''}:${entry.messageCount}:${entry.tokenCount ?? ''}:${entry.status ?? ''}`;
          if (previous.get(entry.id) !== key) changed.add(entry.id);
        }
        for (const id of previous.keys()) if (!seen.has(id)) changed.add(id);
        if (changed.size > 0) await fetchFull(changed);
        else revRef.current = digest.rev;
      } catch (err) {
        if (!isAbortError(err) && revRef.current === 0) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    void poll();
    const timer = setInterval(() => void poll(), DIGEST_MS);
    const onVisibilityChange = () => {
      if (!document.hidden) void poll();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      requestRef.current?.controller.abort();
    };
  }, [beginRequest, fetchFull, isCurrentRequest]);

  return { tasks, isLoading, error, lastUpdate, refresh, changedIds };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

function digestKey(task: Task): string {
  return `${task.lastActivity instanceof Date ? task.lastActivity.toISOString() : task.lastActivity}:${task.messageCount}:${task.tokenCount ?? ''}:${task.status}`;
}
