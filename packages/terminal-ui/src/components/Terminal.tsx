import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { WebglAddon } from '@xterm/addon-webgl';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import type { TerminalClient, TerminalConnectionState } from '@bohemian/terminal-client';
import type { TerminalOutputFrame } from '@bohemian/terminal-protocol';

import { resolveTerminalAppearance, useTerminalAppearance } from '../appearance';
import { ensureTerminalStyles } from '../styles';
import { clampViewportLine, isCorruptTerminalScroll, isViewportAtBottom } from '../viewport';
import { attachTerminalWheelController } from '../terminalWheel';
import { attachTerminalTextSelection } from '../terminalSelection';
import { attachTerminalPaste, formatAgentPaste } from '../terminalPaste';
import { captureTerminalScrollIntent, restoreTerminalScrollIntentAfterOutput, restoreTerminalScrollIntentAfterStructure } from '../terminalScrollIntent';
import { buildTerminalOptions } from '../terminalOptions';
import { buildTerminalSnapshotReplay } from '../terminalSnapshotReplay';
import { getTerminalOutputScheduler } from '../terminalOutputScheduler';
import { activateTerminalUnicode, withTerminalScrollbarTheme } from '../unicode';
import '@xterm/xterm/css/xterm.css';

export interface TerminalHandle {
  focus(): void;
  blur(): void;
  fit(): void;
  openSearch(): void;
  copy(): Promise<void>;
  paste(): Promise<void>;
  selectAll(): void;
  clear(): Promise<void>;
}

interface TerminalProps {
  terminalId: string;
  client: TerminalClient;
  active?: boolean;
  /** Skip live rendering while the owning surface is hidden/minimized. */
  parked?: boolean;
  /** WebGL overlay breaks under CSS camera transforms (tldraw shapes). */
  gpu?: boolean;
  onFocus?: () => void;
  onExit?: (code: number | null) => void;
}

const TERMINAL_OUTPUT_BACKLOG_MAX_CHARS = 2 * 1024 * 1024;

type XtermViewport = {
  syncScrollArea: (...args: unknown[]) => void;
  _viewportElement?: HTMLElement;
  _currentRowHeight?: number;
};

function getXtermViewport(xterm: XTerm): XtermViewport | undefined {
  return (xterm as XTerm & { _core?: { viewport?: XtermViewport } })._core?.viewport;
}

function restoreViewport(xterm: XTerm, atBottom: boolean, line: number) {
  if (atBottom) xterm.scrollToBottom();
  else xterm.scrollToLine(clampViewportLine(line, xterm.buffer.active.baseY));
}

function captureViewport(xterm: XTerm) {
  const buffer = xterm.buffer.active;
  return {
    atBottom: isViewportAtBottom(buffer.viewportY, buffer.baseY),
    line: buffer.viewportY,
  };
}

/** xterm treats a transformed/hidden parent's scrollTop=0 as "user went to top". */
function guardViewportSync(xterm: XTerm) {
  const viewport = getXtermViewport(xterm);
  if (!viewport) return;
  const original = viewport.syncScrollArea.bind(viewport);
  viewport.syncScrollArea = (...args: unknown[]) => {
    try {
      original(...args);
    } catch {
      // xterm 5.5 schedules syncScrollArea from the Viewport constructor.
      // React can dispose the renderer before that timeout fires.
    }
  };

  const element = viewport._viewportElement;
  if (!element) return;
  let lastUserAt = 0;
  const markUser = () => {
    lastUserAt = Date.now();
  };
  element.addEventListener('wheel', markUser, { capture: true, passive: true });
  element.addEventListener('pointerdown', markUser, { capture: true });
  element.addEventListener('scroll', (event) => {
    if (!isCorruptTerminalScroll({
      hasOffsetParent: Boolean(element.offsetParent),
      offsetHeight: element.offsetHeight,
      scrollTop: element.scrollTop,
      viewportY: xterm.buffer.active.viewportY,
      msSinceUserInput: Date.now() - lastUserAt,
    })) return;
    event.stopImmediatePropagation();
    const rowHeight = viewport._currentRowHeight ?? 0;
    const viewportY = xterm.buffer.active.viewportY;
    if (rowHeight > 0 && viewportY > 0) {
      element.scrollTop = viewportY * rowHeight;
    }
  }, true);
}


export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  { terminalId, client, active = true, parked = false, gpu = true, onFocus, onExit },
  ref,
) {
  ensureTerminalStyles();
  const containerRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const sequenceRef = useRef(0);
  const hydrationRef = useRef(0);
  const hydrationPromiseRef = useRef<Promise<void> | null>(null);
  const hydratingRef = useRef(false);
  const pendingOutputRef = useRef<TerminalOutputFrame[]>([]);
  const pendingOutputCharsRef = useRef(0);
  const renderQueueRef = useRef<TerminalOutputFrame[]>([]);
  const renderQueueCharsRef = useRef(0);
  const backlogWarningPendingRef = useRef(false);
  const renderBusyRef = useRef(false);
  const schedulerRef = useRef<ReturnType<typeof getTerminalOutputScheduler> | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const fitRetryFrameRef = useRef<number | null>(null);
  const fitProposalRef = useRef<{ cols: number; rows: number } | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const parkedRef = useRef(parked);
  const activeRef = useRef(active);
  const onFocusRef = useRef(onFocus);
  const onExitRef = useRef(onExit);
  parkedRef.current = parked;
  activeRef.current = active;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [connection, setConnection] = useState<TerminalConnectionState>(client.getConnectionState());
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const appearance = useTerminalAppearance();
  const resolved = resolveTerminalAppearance(appearance);

  const scheduleRenderDrain = useCallback(() => {
    schedulerRef.current?.schedule(terminalId);
  }, [terminalId]);

  const queueOutputFrame = useCallback((frame: TerminalOutputFrame): void => {
    const nextFrame = backlogWarningPendingRef.current ? { ...frame, droppedOutput: true } : frame;
    backlogWarningPendingRef.current = false;
    renderQueueRef.current.push(nextFrame);
    renderQueueCharsRef.current += nextFrame.data.length;
    while (
      renderQueueCharsRef.current > TERMINAL_OUTPUT_BACKLOG_MAX_CHARS &&
      renderQueueRef.current.length > 1
    ) {
      const dropped = renderQueueRef.current.shift();
      if (!dropped) break;
      renderQueueCharsRef.current -= dropped.data.length;
      client.ackTerminal(dropped);
      backlogWarningPendingRef.current = true;
    }
  }, [client]);

  const drainRenderQueue = useCallback((deadline: number): boolean => {
    const xterm = xtermRef.current;
    if (!xterm || renderBusyRef.current || renderQueueRef.current.length === 0) return false;
    renderBusyRef.current = true;
    const batch: TerminalOutputFrame[] = [];
    while (renderQueueRef.current.length > 0 && (batch.length === 0 || performance.now() < deadline)) {
      const frame = renderQueueRef.current.shift();
      if (frame) {
        renderQueueCharsRef.current -= frame.data.length;
        batch.push(frame);
      }
    }
    const body = batch.map((frame) => (
      `${frame.droppedOutput ? '\r\n\x1b[33m[terminal output backlog skipped; restore from snapshot if needed]\x1b[0m\r\n' : ''}${frame.data}`
    )).join('');
    const intent = captureTerminalScrollIntent(xterm);
    xterm.write(body, () => {
      restoreTerminalScrollIntentAfterOutput(xterm, intent);
      requestAnimationFrame(() => restoreTerminalScrollIntentAfterOutput(xterm, intent));
      for (const frame of batch) client.ackTerminal(frame);
      renderBusyRef.current = false;
      if (renderQueueRef.current.length > 0) scheduleRenderDrain();
    });
    return false;
  }, [client, scheduleRenderDrain]);
  const fit = useCallback(() => {
    const xterm = xtermRef.current;
    const addon = fitAddonRef.current;
    const container = containerRef.current;
    if (!xterm || !addon || !container || container.clientWidth < 20 || container.clientHeight < 20) return;
    const proposed = addon.proposeDimensions();
    if (!proposed || (proposed.cols === xterm.cols && proposed.rows === xterm.rows)) return;
    const previous = fitProposalRef.current;
    fitProposalRef.current = { cols: proposed.cols, rows: proposed.rows };
    if (!previous || previous.cols !== proposed.cols || previous.rows !== proposed.rows) {
      if (fitRetryFrameRef.current === null) {
        fitRetryFrameRef.current = requestAnimationFrame(() => {
          fitRetryFrameRef.current = null;
          fitRef.current();
        });
      }
      return;
    }
    const snapshot = captureViewport(xterm);
    const scrollIntent = captureTerminalScrollIntent(xterm);
    try {
      addon.fit();
      void client.resizeTerminal(terminalId, xterm.cols, xterm.rows).catch(() => {});
    } catch {
      // A detached or display:none container cannot be measured yet.
    }
    restoreTerminalScrollIntentAfterStructure(xterm, scrollIntent);
    restoreViewport(xterm, snapshot.atBottom, snapshot.line);
    requestAnimationFrame(() => {
      restoreTerminalScrollIntentAfterStructure(xterm, scrollIntent);
    });
  }, [client, terminalId]);
  fitRef.current = fit;

  const hydrate = useCallback(async () => {
    const generation = ++hydrationRef.current;
    hydratingRef.current = true;
    pendingOutputRef.current = [];
    try {
      const snapshot = await client.getSnapshot(terminalId);
      const xterm = xtermRef.current;
      if (generation !== hydrationRef.current) return;
      if (!xterm) {
        hydratingRef.current = false;
        return;
      }
      const viewport = captureViewport(xterm);
      const scrollIntent = captureTerminalScrollIntent(xterm);
      xterm.reset();
      sequenceRef.current = snapshot?.sequence ?? 0;
      const replay: TerminalOutputFrame[] = [];
      for (const item of pendingOutputRef.current) {
        if (item.sequence > sequenceRef.current) replay.push(item);
        else client.ackTerminal(item);
      }
      pendingOutputRef.current = [];
      pendingOutputCharsRef.current = 0;
      const finish = () => {
        const live = xtermRef.current;
        if (generation !== hydrationRef.current || !live) return;
        for (const item of replay) {
          if (item.sequence <= sequenceRef.current) continue;
          sequenceRef.current = item.sequence;
          queueOutputFrame(item);
        }
        hydratingRef.current = false;
        scheduleRenderDrain();
        fit();
        restoreTerminalScrollIntentAfterStructure(live, scrollIntent);
        restoreViewport(live, viewport.atBottom, viewport.line);
      };
      if (!snapshot) {
        finish();
        return;
      }
      const replayBody = buildTerminalSnapshotReplay(snapshot);
      if (!replayBody) {
        finish();
        return;
      }
      xterm.write(replayBody, finish);
      setError(null);
    } catch (cause) {
      hydratingRef.current = false;
      if (generation === hydrationRef.current) {
        setError(cause instanceof Error ? cause.message : 'Failed to restore terminal');
      }
    }
  }, [client, fit, terminalId]);

  const requestHydrate = useCallback((): Promise<void> => {
    const current = hydrationPromiseRef.current;
    if (current) return current;
    const next = hydrate().finally(() => {
      if (hydrationPromiseRef.current === next) hydrationPromiseRef.current = null;
    });
    hydrationPromiseRef.current = next;
    return next;
  }, [hydrate]);

  useImperativeHandle(ref, () => ({
    focus: () => xtermRef.current?.focus(),
    blur: () => xtermRef.current?.blur(),
    fit,
    openSearch: () => setSearchOpen(true),
    copy: async () => {
      const selection = xtermRef.current?.getSelection();
      if (selection) await navigator.clipboard.writeText(selection);
    },
    paste: async () => {
      const text = await navigator.clipboard.readText();
      if (text) client.writeInput(terminalId, formatAgentPaste(text));
    },
    selectAll: () => xtermRef.current?.selectAll(),
    clear: async () => {
      xtermRef.current?.clear();
      await client.clearBuffer(terminalId);
    },
  }), [client, fit, terminalId]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const current = resolveTerminalAppearance(useTerminalAppearance.getState());
    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();
    const unicode11Addon = new Unicode11Addon();
    const xterm = new XTerm(buildTerminalOptions({
      cursorBlink: current.cursorBlink,
      cursorStyle: current.cursorStyle,
      fontFamily: current.fontFamily,
      fontSize: current.fontSize,
      theme: withTerminalScrollbarTheme(current.theme),
    }));
    xterm.loadAddon(fitAddon);
    xterm.loadAddon(searchAddon);
    xterm.loadAddon(unicode11Addon);
    activateTerminalUnicode(xterm);
    xterm.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')));
    xterm.open(container);
    const detachWheel = attachTerminalWheelController(xterm, container, {
      writeInput: (data) => {
        client.writeInput(terminalId, data);
      },
    });
    const detachSelection = attachTerminalTextSelection(container, xterm);
    const detachPaste = attachTerminalPaste(container, (data) => {
      client.writeInput(terminalId, data);
    });
    guardViewportSync(xterm);
    if (gpu) {
      try {
        const webgl = new WebglAddon();
        webgl.onContextLoss(() => webgl.dispose());
        xterm.loadAddon(webgl);
      } catch {
        // Canvas renderer is the supported fallback.
      }
    }
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const scheduler = getTerminalOutputScheduler(client);
    schedulerRef.current = scheduler;
    const unregisterOutputScheduler = scheduler.register(terminalId, {
      drain: drainRenderQueue,
      hasPending: () => !renderBusyRef.current && renderQueueRef.current.length > 0,
      isActive: () => activeRef.current && !document.hidden && !parkedRef.current,
    });

    xterm.attachCustomKeyEventHandler((event) => {
      const mod = event.metaKey || event.ctrlKey;
      if (event.type !== 'keydown' || !mod) return true;
      if (event.key.toLowerCase() === 'f') {
        setSearchOpen(true);
        return false;
      }
      if (event.key.toLowerCase() === 'c' && xterm.hasSelection()) {
        void navigator.clipboard.writeText(xterm.getSelection());
        return false;
      }
      if (event.key.toLowerCase() === 'k') {
        xterm.clear();
        void client.clearBuffer(terminalId);
        return false;
      }
      return true;
    });

    const dataDisposable = xterm.onData((data) => {
      const next = detachPaste.prepareInput(data);
      if (next === null) return;
      if (!client.writeInput(terminalId, next)) {
        setError('Terminal connection is not ready');
      }
    });
    const focusListener = () => onFocusRef.current?.();
    container.addEventListener('pointerdown', focusListener);

    const unsubscribeOutput = client.subscribeToOutput(terminalId, (frame) => {
      const { data, sequence, droppedOutput } = frame;
      if (hydratingRef.current) {
        pendingOutputRef.current.push(frame);
        pendingOutputCharsRef.current += frame.data.length;
        while (
          pendingOutputCharsRef.current > TERMINAL_OUTPUT_BACKLOG_MAX_CHARS &&
          pendingOutputRef.current.length > 1
        ) {
          const dropped = pendingOutputRef.current.shift();
          if (!dropped) break;
          pendingOutputCharsRef.current -= dropped.data.length;
          client.ackTerminal(dropped);
        }
        return;
      }
      if (document.hidden || parkedRef.current) {
        client.ackTerminal(frame);
        return;
      }
      if (sequence <= sequenceRef.current) {
        client.ackTerminal(frame);
        return;
      }
      sequenceRef.current = sequence;
      queueOutputFrame(frame);
      scheduleRenderDrain();
    });
    const unsubscribeExit = client.subscribeToExit(terminalId, (code) => {
      setExitCode(code);
      onExitRef.current?.(code);
    });
    const unsubscribeConnection = client.subscribeToConnection((state) => {
      setConnection(state);
      if (state === 'connected') void requestHydrate();
    });

    const observer = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fit();
      });
    });
    observer.observe(container);
    let cancelled = false;
    requestAnimationFrame(() => {
      if (!cancelled) fit();
    });

    return () => {
      cancelled = true;
      hydrationRef.current += 1;
      observer.disconnect();
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      renderQueueRef.current = [];
      renderQueueCharsRef.current = 0;
      if (fitRetryFrameRef.current !== null) cancelAnimationFrame(fitRetryFrameRef.current);
      fitRetryFrameRef.current = null;
      fitProposalRef.current = null;
      detachWheel();
      detachSelection();
      detachPaste();
      unsubscribeOutput();
      unsubscribeExit();
      unsubscribeConnection();
      unregisterOutputScheduler();
      schedulerRef.current = null;
      container.removeEventListener('pointerdown', focusListener);
      dataDisposable.dispose();
      unicode11Addon.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      try {
        xterm.dispose();
      } catch {
        // Pending Viewport timeout may run against a disposed renderer.
      }
    };
  }, [client, drainRenderQueue, fit, gpu, requestHydrate, terminalId]);

  useEffect(() => {
    const syncParking = () => {
      const isParked = document.hidden || parked;
      const request = isParked
        ? client.pauseTerminal(terminalId)
        : client.resumeTerminal(terminalId);
      void request.catch(() => false).finally(() => {
        if (!isParked) void requestHydrate();
      });
    };
    syncParking();
    document.addEventListener('visibilitychange', syncParking);
    return () => document.removeEventListener('visibilitychange', syncParking);
  }, [client, requestHydrate, parked, terminalId]);

  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    xterm.options.fontFamily = resolved.fontFamily;
    xterm.options.fontSize = resolved.fontSize;
    xterm.options.lineHeight = 1;
    xterm.options.fontWeight = '300';
    xterm.options.fontWeightBold = '500';
    xterm.options.cursorBlink = resolved.cursorBlink;
    xterm.options.cursorStyle = resolved.cursorStyle;
    xterm.options.cursorInactiveStyle = resolved.cursorStyle === 'block' ? 'outline' : resolved.cursorStyle;
    xterm.options.minimumContrastRatio = buildTerminalOptions({
      cursorBlink: resolved.cursorBlink,
      cursorStyle: resolved.cursorStyle,
      fontFamily: resolved.fontFamily,
      fontSize: resolved.fontSize,
      theme: resolved.theme,
    }).minimumContrastRatio;
    xterm.options.theme = withTerminalScrollbarTheme(resolved.theme);
    xterm.refresh(0, Math.max(0, xterm.rows - 1));
    requestAnimationFrame(fit);
  }, [fit, resolved.cursorBlink, resolved.cursorStyle, resolved.fontFamily, resolved.fontId, resolved.fontSize, resolved.lineHeight, resolved.themeId, resolved.theme.background, resolved.theme.foreground, resolved.theme.cursor]);

  useEffect(() => {
    if (!active) return;
    requestAnimationFrame(() => {
      fit();
      xtermRef.current?.focus();
    });
  }, [active, fit]);

  useEffect(() => {
    if (!searchTerm) return;
    searchAddonRef.current?.findNext(searchTerm, {
      incremental: true,
      decorations: {
        activeMatchBackground: '#facc15',
        matchBackground: '#52525b',
        matchOverviewRuler: '#71717a',
        activeMatchColorOverviewRuler: '#facc15',
      },
    });
  }, [searchTerm]);

  return (
    <div className="bac-term relative h-full w-full overflow-hidden" style={{ background: resolved.theme.background }}>
      <div ref={containerRef} className="h-full w-full" />
      {searchOpen && (
        <form
          className="absolute right-2 top-2 z-20 flex border border-zinc-700 bg-zinc-950 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            searchAddonRef.current?.findNext(searchTerm);
          }}
        >
          <input
            autoFocus
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setSearchOpen(false);
              if (event.key === 'Enter' && event.shiftKey) {
                event.preventDefault();
                searchAddonRef.current?.findPrevious(searchTerm);
              }
            }}
            placeholder="Find"
            className="w-48 bg-transparent px-2 py-1 text-xs text-zinc-100 outline-none"
          />
          <button type="button" title="Previous match" onClick={() => searchAddonRef.current?.findPrevious(searchTerm)} className="px-2 text-zinc-400 hover:text-white">↑</button>
          <button type="submit" title="Next match" className="px-2 text-zinc-400 hover:text-white">↓</button>
          <button type="button" title="Close search" onClick={() => setSearchOpen(false)} className="px-2 text-zinc-400 hover:text-white">×</button>
        </form>
      )}
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
        <button type="button" onClick={() => setError(null)} className="absolute bottom-2 left-1/2 -translate-x-1/2 border border-red-900 bg-red-950 px-2 py-1 text-xs text-red-200">
          {error}
        </button>
      )}
    </div>
  );
});
