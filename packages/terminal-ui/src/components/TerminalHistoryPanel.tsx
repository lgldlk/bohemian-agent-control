import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { TerminalClient } from '@bohemian/terminal-client';
import type { TerminalHistoryEntry, TerminalSearchMatch } from '@bohemian/terminal-protocol';

export function TerminalHistoryPanel({
  client,
  onClose,
  onOpen,
}: {
  client: TerminalClient;
  onClose: () => void;
  onOpen: (terminalId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [entries, setEntries] = useState<TerminalHistoryEntry[]>([]);
  const [matches, setMatches] = useState<TerminalSearchMatch[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (query.trim()) {
            const found = await client.searchTerminals(query.trim());
            if (cancelled) return;
            setMatches(found);
            setEntries([]);
          } else {
            const recent = await client.terminalHistory();
            if (cancelled) return;
            setEntries(recent);
            setMatches([]);
          }
          setError(null);
        } catch (cause) {
          if (!cancelled) setError(cause instanceof Error ? cause.message : 'Search failed');
        }
      })();
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [client, query]);

  const rows = query.trim()
    ? matches.map((match) => ({
        key: `${match.kind}:${match.terminalId}:${match.at ?? ''}:${match.excerpt}`,
        terminalId: match.terminalId,
        title: match.title,
        kind: match.kind,
        text: match.excerpt,
      }))
    : entries.map((entry) => ({
        key: `${entry.terminalId}:${entry.at}:${entry.command}`,
        terminalId: entry.terminalId,
        title: entry.title,
        kind: 'command' as const,
        text: entry.command,
      }));

  return (
    <section className="pointer-events-auto fixed bottom-16 right-3 z-[160000] flex max-h-[min(70vh,520px)] w-[min(440px,calc(100vw-24px))] flex-col border border-zinc-700 bg-zinc-950 shadow-2xl">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-2">
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Escape') onClose(); }}
          placeholder="Search commands and output"
          className="min-w-0 flex-1 bg-transparent text-xs text-zinc-100 outline-none placeholder:text-zinc-600"
        />
        <button type="button" aria-label="Close history" onClick={onClose} className="flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-white">
          <X size={14} />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {error && <p className="px-2 py-2 text-xs text-red-300">{error}</p>}
        {!error && rows.length === 0 && (
          <p className="px-2 py-3 text-xs text-zinc-500">
            {query.trim() ? 'No matches.' : 'Commands you run in any terminal show up here.'}
          </p>
        )}
        {rows.map((row) => (
          <button
            key={row.key}
            type="button"
            onClick={() => onOpen(row.terminalId)}
            className="flex w-full flex-col gap-0.5 px-2 py-1.5 text-left hover:bg-zinc-900"
          >
            <span className="flex items-center gap-2 text-[10px] uppercase text-zinc-500">
              <span className={row.kind === 'command' ? 'text-emerald-400' : 'text-zinc-400'}>{row.kind}</span>
              <span className="truncate normal-case">{row.title}</span>
            </span>
            <span className="truncate font-mono text-xs text-zinc-200">{row.text}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
