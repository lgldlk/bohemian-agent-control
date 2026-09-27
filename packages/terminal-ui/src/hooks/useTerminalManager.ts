import { useCallback, useEffect, useState } from 'react';
import type { TerminalClient, TerminalConnectionState } from '@bohemian/terminal-client';
import type { TerminalCreateOptions, TerminalInfo } from '@bohemian/terminal-protocol';

export interface TerminalSession {
  id: string;
  nodeId?: string;
  info: TerminalInfo;
}

/** React state bridge for the server-owned terminal inventory. */
export function useTerminalManager(client: TerminalClient) {
  const [terminals, setTerminals] = useState<TerminalSession[]>([]);
  const [activeTerminalId, setActiveTerminalId] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<TerminalConnectionState>(client.getConnectionState());
  const [inventoryLoaded, setInventoryLoaded] = useState(false);

  const refresh = useCallback(async () => {
    const infos = await client.listTerminals();
    setTerminals(infos.map((info) => ({ id: info.id, nodeId: info.nodeId, info })));
    setInventoryLoaded(true);
    setActiveTerminalId((current) => current && infos.some((info) => info.id === current)
      ? current
      : (infos.find((info) => info.status === 'running')?.id ?? infos[0]?.id ?? null));
  }, [client]);

  useEffect(() => {
    const unsubscribeConnection = client.subscribeToConnection((state) => {
      setConnectionState(state);
      if (state !== 'connected') setInventoryLoaded(false);
      if (state === 'connected') void refresh().catch(() => {});
    });
    const unsubscribeEvents = client.subscribeToEvents((event) => {
      if (event.type === 'created' || event.type === 'updated') {
        const info = event.terminal;
        setTerminals((current) => [
          ...current.filter((terminal) => terminal.id !== info.id),
          { id: info.id, nodeId: info.nodeId, info },
        ].sort((a, b) => b.info.updatedAt - a.info.updatedAt));
      } else if (event.type === 'closed') {
        setTerminals((current) => current.filter((terminal) => terminal.id !== event.terminalId));
        setActiveTerminalId((active) => active === event.terminalId ? null : active);
      } else if (event.type === 'exit') {
        setTerminals((current) => current.map((terminal) => terminal.id === event.terminalId
          ? { ...terminal, info: { ...terminal.info, status: 'exited', exitCode: event.exitCode ?? undefined } }
          : terminal));
      }
    });
    client.connect();
    return () => {
      unsubscribeConnection();
      unsubscribeEvents();
    };
  }, [client, refresh]);

  const createTerminal = useCallback(async (options: TerminalCreateOptions = {}) => {
    const info = await client.createTerminal(options);
    const session: TerminalSession = { id: info.id, nodeId: info.nodeId, info };
    setTerminals((current) => [...current.filter((item) => item.id !== info.id), session]);
    setActiveTerminalId(info.id);
    return session;
  }, [client]);

  const closeTerminal = useCallback(async (terminalId: string) => {
    await client.closeTerminal(terminalId);
    setTerminals((current) => {
      const next = current.filter((terminal) => terminal.id !== terminalId);
      setActiveTerminalId((active) => active === terminalId ? (next[0]?.id ?? null) : active);
      return next;
    });
  }, [client]);

  const restartTerminal = useCallback(async (terminalId: string) => {
    const info = await client.restartTerminal(terminalId);
    if (info) setTerminals((current) => current.map((terminal) => terminal.id === terminalId ? { ...terminal, info } : terminal));
    return info;
  }, [client]);

  const renameTerminal = useCallback(async (terminalId: string, title: string) => {
    const info = await client.renameTerminal(terminalId, title);
    if (info) setTerminals((current) => current.map((terminal) => terminal.id === terminalId ? { ...terminal, info } : terminal));
    return info;
  }, [client]);

  const getTerminalsForNode = useCallback((nodeId: string) => (
    terminals.filter((terminal) => terminal.nodeId === nodeId)
  ), [terminals]);

  return {
    terminals,
    activeTerminalId,
    connectionState,
    inventoryLoaded,
    createTerminal,
    closeTerminal,
    restartTerminal,
    renameTerminal,
    getTerminalsForNode,
    setActiveTerminalId,
    setActiveTerminal: setActiveTerminalId,
    refresh,
  };
}
