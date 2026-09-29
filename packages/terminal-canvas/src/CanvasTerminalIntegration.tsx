import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { History, Plus, SquareTerminal, X } from 'lucide-react';
import type { TerminalClient } from '@bohemian/terminal-client';
import {
  collectTerminalIds,
  removeTerminalLeaf,
  replaceMissingTerminalIds,
  splitTerminalLeaf,
  terminalLeaf,
  TerminalHistoryPanel,
  updateSplitRatio,
  useTerminalManager,
  createDebouncedTask,
  type TerminalSplitDirection,
} from '@bohemian/terminal-ui';
import {
  CanvasTerminalWindow,
  defaultBounds,
  type CanvasTerminalWindowState,
} from './CanvasTerminalWindow';

export interface CanvasTerminalNode {
  id: string;
  cwd?: string;
  title?: string;
  agentKind?: string;
  sessionId?: string;
  /** True when a live agent process is bound to this session id. */
  live?: boolean;
}

export interface CanvasTerminalIntegrationProps {
  client: TerminalClient;
  nodes?: ReadonlyMap<string, CanvasTerminalNode>;
  selectedNodeId?: string;
  onNodeTerminalOpen?: (nodeId: string, terminalId: string) => void;
}

export interface CanvasTerminalIntegrationHandle {
  openTerminalForNode(nodeId: string): Promise<string>;
  createTerminal(cwd?: string): Promise<string>;
  showTerminal(terminalId: string): void;
}

const STORAGE_KEY = 'bohemian-agent-control:terminal-windows:v2';

/** Canvas-owned floating terminal workspaces backed by server-owned PTYs. */
export const CanvasTerminalIntegration = forwardRef<
  CanvasTerminalIntegrationHandle,
  CanvasTerminalIntegrationProps
>(function CanvasTerminalIntegration(
  { client, nodes = new Map(), selectedNodeId, onNodeTerminalOpen },
  ref,
) {
  const manager = useTerminalManager(client);
  const infos = useMemo(
    () => new Map(manager.terminals.map((terminal) => [terminal.id, terminal.info])),
    [manager.terminals],
  );
  const [terminalWindows, setTerminalWindows] = useState<CanvasTerminalWindowState[]>(loadWindows);
  const [historyOpen, setHistoryOpen] = useState(false);
  const terminalWindowsRef = useRef(terminalWindows);
  const reconciledRef = useRef(false);
  const nextZRef = useRef(Math.max(1000, ...terminalWindows.map((item) => item.zIndex + 1)));
  terminalWindowsRef.current = terminalWindows;

  useEffect(() => {
    if (!manager.inventoryLoaded || reconciledRef.current) return;
    reconciledRef.current = true;
    const available = new Set(manager.terminals.map((terminal) => terminal.id));
    const repaired: CanvasTerminalWindowState[] = [];
    const assigned = new Set<string>();

    for (const item of terminalWindowsRef.current) {
      const layout = replaceMissingTerminalIds(item.layout, available);
      if (!layout) continue;
      const ids = collectTerminalIds(layout);
      ids.forEach((id) => assigned.add(id));
      repaired.push({
        ...item,
        layout,
        activeTerminalId: ids.includes(item.activeTerminalId) ? item.activeTerminalId : ids[0],
      });
    }

    for (const terminal of manager.terminals) {
      if (assigned.has(terminal.id)) continue;
      repaired.push(windowFromTerminal(terminal.info, repaired.length, nextZRef.current++));
    }
    setTerminalWindows(repaired);
  }, [manager.inventoryLoaded, manager.terminals]);

  const parkKey = terminalWindows
    .map((item) => `${item.id}:${item.minimized ? 1 : 0}:${collectTerminalIds(item.layout).join(',')}`)
    .join('|');
  useEffect(() => {
    const park = () => {
      const hidden = document.hidden;
      for (const item of terminalWindowsRef.current) {
        const ids = collectTerminalIds(item.layout);
        for (const id of ids) {
          const op = item.minimized || hidden ? client.pauseTerminal(id) : client.resumeTerminal(id);
          void op.catch(() => false);
        }
      }
    };
    park();
    document.addEventListener('visibilitychange', park);
    return () => document.removeEventListener('visibilitychange', park);
  }, [client, parkKey]);

  useEffect(() => {
    if (!reconciledRef.current) return;
    const persist = createDebouncedTask(120);
    persist.schedule(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(terminalWindows));
      } catch {
        // Layout persistence is best-effort; PTY state is independently persisted by the server.
      }
    });
    return () => persist.cancel();
  }, [terminalWindows]);

  const updateWindow = useCallback((id: string, patch: Partial<CanvasTerminalWindowState>) => {
    setTerminalWindows((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }, []);

  const focusWindow = useCallback((id: string) => {
    const zIndex = nextZRef.current++;
    updateWindow(id, { zIndex });
  }, [updateWindow]);

  const showTerminal = useCallback((terminalId: string) => {
    const item = terminalWindowsRef.current.find((candidate) => collectTerminalIds(candidate.layout).includes(terminalId));
    if (!item) return;
    updateWindow(item.id, { minimized: false, activeTerminalId: terminalId, zIndex: nextZRef.current++ });
  }, [updateWindow]);

  const createWindowTerminal = useCallback(async (node?: CanvasTerminalNode) => {
    const command = node ? resumeCommand(node) : undefined;
    const info = await manager.createTerminal({
      nodeId: node?.id,
      agentKind: node?.agentKind,
      startupCommand: command || undefined,
      launchToken: command ? crypto.randomUUID() : undefined,
      startupCommandDelivery: command ? 'shell-ready' : undefined,
      cwd: node?.cwd,
      title: node?.title ? `${node.title} · terminal` : undefined,
    });
    const terminalWindow = windowFromTerminal(info.info, terminalWindowsRef.current.length, nextZRef.current++);
    setTerminalWindows((current) => [...current, terminalWindow]);
    if (node) {
      onNodeTerminalOpen?.(node.id, info.id);
    }
    return info.id;
  }, [client, manager, onNodeTerminalOpen]);

  const openTerminalForNode = useCallback(async (nodeId: string) => {
    const existingWindow = terminalWindowsRef.current.find((item) => item.nodeId === nodeId);
    if (existingWindow) {
      updateWindow(existingWindow.id, { minimized: false, zIndex: nextZRef.current++ });
      return existingWindow.activeTerminalId;
    }
    const existingTerminal = manager.terminals.find((terminal) => terminal.nodeId === nodeId);
    if (existingTerminal) {
      const terminalWindow = windowFromTerminal(existingTerminal.info, terminalWindowsRef.current.length, nextZRef.current++);
      setTerminalWindows((current) => [...current, terminalWindow]);
      return existingTerminal.id;
    }
    return createWindowTerminal(nodes.get(nodeId) ?? { id: nodeId });
  }, [createWindowTerminal, manager.terminals, nodes, updateWindow]);

  useEffect(() => {
    if (!selectedNodeId) return;
    void openTerminalForNode(selectedNodeId);
  }, [openTerminalForNode, selectedNodeId]);

  useImperativeHandle(ref, () => ({
    openTerminalForNode,
    createTerminal: (cwd) => createWindowTerminal(cwd ? { id: `free-${Date.now()}`, cwd } : undefined),
    showTerminal,
  }), [createWindowTerminal, openTerminalForNode, showTerminal]);

  const splitPane = useCallback(async (
    windowId: string,
    terminalId: string,
    direction: TerminalSplitDirection,
  ) => {
    const owner = terminalWindowsRef.current.find((item) => item.id === windowId);
    if (!owner) return;
    const source = infos.get(terminalId);
    const created = await manager.createTerminal({
      nodeId: owner.nodeId,
      cwd: source?.cwd || owner.cwd,
      title: `${owner.title} · pane`,
      size: source?.size,
    });
    setTerminalWindows((current) => current.map((item) => item.id === windowId ? {
      ...item,
      layout: splitTerminalLeaf(item.layout, terminalId, created.id, direction),
      activeTerminalId: created.id,
    } : item));
  }, [infos, manager]);

  const closePane = useCallback(async (windowId: string, terminalId: string) => {
    const owner = terminalWindowsRef.current.find((item) => item.id === windowId);
    if (!owner) return;
    await manager.closeTerminal(terminalId);
    setTerminalWindows((current) => current.flatMap((item) => {
      if (item.id !== windowId) return [item];
      const layout = removeTerminalLeaf(item.layout, terminalId);
      if (!layout) return [];
      const ids = collectTerminalIds(layout);
      return [{ ...item, layout, activeTerminalId: ids.includes(item.activeTerminalId) ? item.activeTerminalId : ids[0] }];
    }));
  }, [infos, manager]);

  const closeWindow = useCallback(async (windowId: string) => {
    const owner = terminalWindowsRef.current.find((item) => item.id === windowId);
    if (!owner) return;
    const ids = collectTerminalIds(owner.layout);
    await Promise.all(ids.map((id) => manager.closeTerminal(id).catch(() => false)));
    setTerminalWindows((current) => current.filter((item) => item.id !== windowId));
  }, [infos, manager]);

  const activeCount = manager.terminals.filter((terminal) => terminal.info.status === 'running').length;

  return (
    <div className="pointer-events-none fixed inset-0 z-[150000]">
      <div className="pointer-events-auto">
        {terminalWindows.map((terminalWindow) => (
          <CanvasTerminalWindow
            key={terminalWindow.id}
            window={terminalWindow}
            client={client}
            infos={infos}
            onFocus={() => focusWindow(terminalWindow.id)}
            onChange={(patch) => updateWindow(terminalWindow.id, patch)}
            onSplit={(terminalId, direction) => void splitPane(terminalWindow.id, terminalId, direction)}
            onClosePane={(terminalId) => void closePane(terminalWindow.id, terminalId)}
            onRestartPane={(terminalId) => void manager.restartTerminal(terminalId)}
            onRenamePane={(terminalId, title) => void manager.renameTerminal(terminalId, title)}
            onRatioChange={(splitId, ratio) => updateWindow(terminalWindow.id, {
              layout: updateSplitRatio(terminalWindow.layout, splitId, ratio),
            })}
            onCloseWindow={() => void closeWindow(terminalWindow.id)}
          />
        ))}
      </div>

      {historyOpen && (
        <TerminalHistoryPanel
          client={client}
          onClose={() => setHistoryOpen(false)}
          onOpen={(terminalId) => {
            showTerminal(terminalId);
            setHistoryOpen(false);
          }}
        />
      )}

      <div className="pointer-events-auto fixed bottom-3 right-3 flex max-w-[calc(100vw-24px)] items-center gap-1 border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">
        <button
          type="button"
          title="New terminal"
          aria-label="New terminal"
          onClick={() => void createWindowTerminal()}
          className="flex h-8 w-8 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white"
        >
          <Plus size={15} />
        </button>
        <button
          type="button"
          title="Search command history"
          aria-label="Search command history"
          onClick={() => setHistoryOpen((open) => !open)}
          className={`flex h-8 w-8 items-center justify-center hover:bg-zinc-800 hover:text-white ${historyOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400'}`}
        >
          <History size={15} />
        </button>
        <div className="h-5 w-px bg-zinc-800" />
        <div className="flex max-w-[min(60vw,640px)] gap-1 overflow-x-auto">
          {terminalWindows.map((item) => {
            const ids = collectTerminalIds(item.layout);
            const running = ids.some((id) => infos.get(id)?.status === 'running');
            return (
              <button
                key={item.id}
                type="button"
                title={item.cwd}
                onClick={() => updateWindow(item.id, {
                  minimized: !item.minimized,
                  zIndex: nextZRef.current++,
                })}
                className={`flex h-8 max-w-48 shrink-0 items-center gap-1.5 px-2 text-xs ${item.minimized ? 'bg-zinc-900 text-zinc-500' : 'bg-zinc-800 text-zinc-100'}`}
              >
                <SquareTerminal size={13} className={running ? 'text-emerald-400' : 'text-zinc-600'} />
                <span className="truncate">{item.title}</span>
                <span className="text-[10px] text-zinc-600">{ids.length}</span>
              </button>
            );
          })}
        </div>
        {terminalWindows.length > 0 && (
          <button
            type="button"
            title="Minimize all terminals"
            aria-label="Minimize all terminals"
            onClick={() => setTerminalWindows((current) => current.map((item) => ({ ...item, minimized: true })))}
            className="flex h-8 w-8 items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-white"
          >
            <X size={14} />
          </button>
        )}
        <span className="px-1 text-[10px] tabular-nums text-zinc-600">{activeCount}</span>
      </div>
    </div>
  );
});

function windowFromTerminal(
  info: { id: string; nodeId?: string; title: string; cwd: string },
  index: number,
  zIndex: number,
): CanvasTerminalWindowState {
  return {
    id: `terminal-window-${info.id}`,
    nodeId: info.nodeId,
    title: info.title,
    cwd: info.cwd,
    layout: terminalLeaf(info.id),
    activeTerminalId: info.id,
    bounds: defaultBounds((index % 6) * 24),
    minimized: false,
    maximized: false,
    zIndex,
  };
}

function loadWindows(): CanvasTerminalWindowState[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') as CanvasTerminalWindowState[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => item?.id && item?.layout && item?.bounds).map((item) => ({
      ...item,
      minimized: true,
      maximized: false,
      restoreBounds: undefined,
    }));
  } catch {
    return [];
  }
}

function resumeCommand(node: CanvasTerminalNode): string | null {
  const id = shellQuote(node.sessionId || node.id);
  if (node.agentKind === 'codex') return `codex resume ${id}`;
  if (node.agentKind === 'claude-code') return `claude --resume ${id}`;
  if (node.agentKind === 'pi') return `pi --session ${id}`;
  return null;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
