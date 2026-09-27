import { useState, useEffect, useCallback } from 'react';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';

const KEY = 'bohemian-agent-control:watchlist:v1';

function load(): string[] {
  return readLocalJson(KEY, (value) => Array.isArray(value)
    ? value.filter((x): x is string => typeof x === 'string') : null, () => []);
}

/** 盯盘列表:按 PIN 顺序存 session id,持久化到 localStorage */
export function useWatchlist() {
  const [ids, setIds] = useState<string[]>(load);

  useEffect(() => {
    writeLocalJson(KEY, ids);
  }, [ids]);

  const toggle = useCallback((id: string) => {
    setIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const remove = useCallback((id: string) => {
    setIds((prev) => prev.filter((x) => x !== id));
  }, []);

  const clear = useCallback(() => setIds([]), []);

  return { ids, toggle, remove, clear };
}
