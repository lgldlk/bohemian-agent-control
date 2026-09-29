import type { FormEvent, KeyboardEvent } from 'react';
import type { TerminalConnectionState } from '@bohemian/terminal-client';
import type { SearchAddon } from '@xterm/addon-search';

interface TerminalSearchOverlayProps {
  searchTerm: string;
  searchAddon: SearchAddon | null;
  onSearchTermChange: (value: string) => void;
  onClose: () => void;
}

export function TerminalSearchOverlay({
  searchTerm,
  searchAddon,
  onSearchTermChange,
  onClose,
}: TerminalSearchOverlayProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    searchAddon?.findNext(searchTerm);
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault();
      searchAddon?.findPrevious(searchTerm);
    }
  };

  return (
    <form
      className="absolute right-2 top-2 z-20 flex border border-zinc-700 bg-zinc-950 shadow-xl"
      onSubmit={submit}
    >
      <input
        autoFocus
        value={searchTerm}
        onChange={(event) => onSearchTermChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find"
        className="w-48 bg-transparent px-2 py-1 text-xs text-zinc-100 outline-none"
      />
      <button type="button" title="Previous match" onClick={() => searchAddon?.findPrevious(searchTerm)} className="px-2 text-zinc-400 hover:text-white">↑</button>
      <button type="submit" title="Next match" className="px-2 text-zinc-400 hover:text-white">↓</button>
      <button type="button" title="Close search" onClick={onClose} className="px-2 text-zinc-400 hover:text-white">×</button>
    </form>
  );
}

interface TerminalStatusOverlaysProps {
  connection: TerminalConnectionState;
  exitCode: number | null | undefined;
  error: string | null;
  onDismissError: () => void;
}

export function TerminalStatusOverlays({
  connection,
  exitCode,
  error,
  onDismissError,
}: TerminalStatusOverlaysProps) {
  return (
    <>
      {connection !== 'connected' && (
        <div className="pointer-events-none absolute bottom-2 right-2 border border-zinc-700 bg-black/90 px-2 py-1 text-[10px] uppercase text-zinc-400">
          {connection === 'connecting' ? 'Connecting' : 'Reconnecting'}
        </div>
      )}
      {exitCode !== undefined && (
        <div className="pointer-events-none absolute bottom-2 left-2 border border-zinc-700 bg-black/90 px-2 py-1 text-[10px] text-zinc-400">
          Process exited {exitCode === null ? '' : `(${exitCode})`}
        </div>
      )}
      {error && (
        <button type="button" onClick={onDismissError} className="absolute bottom-2 left-1/2 -translate-x-1/2 border border-red-900 bg-red-950 px-2 py-1 text-xs text-red-200">
          {error}
        </button>
      )}
    </>
  );
}
