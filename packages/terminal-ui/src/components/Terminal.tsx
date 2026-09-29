import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { Unicode11Addon } from '@xterm/addon-unicode11';
import type { TerminalConnectionState } from '@bohemian/terminal-client';
import type { TerminalOutputFrame } from '@bohemian/terminal-protocol';
import type { TerminalResourceRef } from '../terminalResources';
import {
  createTerminalResourceLinksProvider,
  installTerminalResourceLinkClickFallback,
} from '../terminalResourceLinks';
import { resolveTerminalAppearance, useTerminalAppearance } from '../appearance';
import { ensureTerminalStyles } from '../styles';
import { attachTerminalWheelController } from '../terminalWheel';
import { attachTerminalTextSelection } from '../terminalSelection';
import { attachTerminalPaste, formatAgentPaste } from '../terminalPaste';
import { captureTerminalScrollIntent, restoreTerminalScrollIntentAfterStructure } from '../terminalScrollIntent';
import {
  buildTerminalOptions,
  TERMINAL_FONT_WEIGHT,
  TERMINAL_FONT_WEIGHT_BOLD,
} from '../terminalOptions';
import { sanitizeTerminalOutput } from '../terminalOutputSanitizer';
import { createTerminalScrollbackFilter } from '../terminalScrollback';
import { installNestedTerminalQueryPolicy } from '../terminalQueryPolicy';
import { isTerminalShortcutTarget, terminalShortcutInput } from '../terminalKeyInput';
import { attachTerminalEventBoundary } from '../terminalEventBoundary';
import { drainHydrationOutput } from '../terminalHydration';
import { buildTerminalSnapshotReplay } from '../terminalSnapshotReplay';
import { getTerminalOutputScheduler } from '../terminalOutputScheduler';
import {
  TerminalRenderController,
  TERMINAL_OUTPUT_BACKLOG_MAX_CHARS,
} from '../terminalRenderController';
import { resolveTerminalPresentation, isTerminalPresentationSuspended, type TerminalPresentationState } from '../terminalPresentation';
import {
  captureRenderedScrollback,
  prependScrollback,
  recallTerminalScrollback,
  rememberTerminalScrollback,
} from '../terminalScrollbackCache';
import { guardViewportSync, refreshTerminalNow, scrollIntentTarget } from '../terminalViewport';
import { createTerminalWebglController } from '../terminalWebgl';
import {
  registerTerminalPerformanceSource,
  terminalPerformanceSnapshotFromStats,
} from '../terminalPerformance';
import { activateTerminalUnicode, withTerminalScrollbarTheme } from '../unicode';
import {
  TerminalSearchOverlay,
  TerminalStatusOverlays,
} from './TerminalOverlays';
import type {
  TerminalHandle,
  TerminalProps,
  TerminalRuntimeState,
} from './terminalTypes';
import '@xterm/xterm/css/xterm.css';

export type {
  TerminalHandle,
  TerminalProps,
  TerminalRuntimePhase,
  TerminalRuntimeState,
} from './terminalTypes';


export const Terminal = forwardRef<TerminalHandle, TerminalProps>(function Terminal(
  {
    terminalId,
    client,
    active = true,
    parked = false,
    gpu = true,
    customGlyphs = false,
    onFocus,
    onInputEvent,
    onExit,
    onResourceActivate,
    terminalLinkResolvers = [],
    terminalResourceCapabilities = {},
    terminalInfo,
    cameraZoom = 1,
    onStatusChange,
  },
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
  const scrollbackFilterRef = useRef<ReturnType<typeof createTerminalScrollbackFilter> | null>(null);
  const scrollbackCacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const renderControllerRef = useRef<TerminalRenderController | null>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const fitRetryFrameRef = useRef<number | null>(null);
  const fitProposalRef = useRef<{ cols: number; rows: number } | null>(null);
  const visualRecoveryFrameRef = useRef<number | null>(null);
  const scrollGestureRef = useRef(0);
  const inputPriorityUntilRef = useRef(0);
  const cameraZoomRef = useRef(cameraZoom);
  const requestWebglRef = useRef<(() => void) | null>(null);
  const releaseWebglRef = useRef<(() => void) | null>(null);
  const presentationRef = useRef<TerminalPresentationState>(parked ? 'cold' : active ? 'hot' : 'warm');
  const evaluatePresentationRef = useRef<(() => void) | null>(null);
  const fitRef = useRef<() => void>(() => {});
  const parkedRef = useRef(parked);
  const activeRef = useRef(active);
  const onFocusRef = useRef(onFocus);
  const onInputEventRef = useRef(onInputEvent);
  const onExitRef = useRef(onExit);
  const onResourceActivateRef = useRef(onResourceActivate);
  const terminalInfoRef = useRef(terminalInfo);
  const onStatusChangeRef = useRef(onStatusChange);
  parkedRef.current = parked;
  activeRef.current = active;
  cameraZoomRef.current = cameraZoom;
  onFocusRef.current = onFocus;
  onInputEventRef.current = onInputEvent;
  onExitRef.current = onExit;
  onResourceActivateRef.current = onResourceActivate;
  terminalInfoRef.current = terminalInfo;
  onStatusChangeRef.current = onStatusChange;
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [connection, setConnection] = useState<TerminalConnectionState>(client.getConnectionState());
  const [exitCode, setExitCode] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const appearance = useTerminalAppearance();
  const resolved = resolveTerminalAppearance(appearance);
  const reportStatus = useCallback((state: TerminalRuntimeState) => {
    onStatusChangeRef.current?.(state);
  }, []);
  const cacheRenderedScrollback = useCallback(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    const text = captureRenderedScrollback(xterm);
    if (text.trim()) rememberTerminalScrollback(terminalId, text);
  }, [terminalId]);
  const scheduleScrollbackCache = useCallback(() => {
    if (scrollbackCacheTimerRef.current !== null) return;
    scrollbackCacheTimerRef.current = setTimeout(() => {
      scrollbackCacheTimerRef.current = null;
      cacheRenderedScrollback();
    }, 200);
  }, [cacheRenderedScrollback]);

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
    const scrollGesture = scrollGestureRef.current;
    const scrollIntent = captureTerminalScrollIntent(xterm);
    try {
      addon.fit();
      void client.resizeTerminal(terminalId, xterm.cols, xterm.rows).catch(() => {});
    } catch {
      // A detached or display:none container cannot be measured yet.
    }
    restoreTerminalScrollIntentAfterStructure(scrollIntentTarget(xterm), scrollIntent);
    requestAnimationFrame(() => {
      if (scrollGestureRef.current === scrollGesture) {
        restoreTerminalScrollIntentAfterStructure(scrollIntentTarget(xterm), scrollIntent);
      }
    });
  }, [client, terminalId]);
  const refreshVisualState = useCallback(() => {
    const container = containerRef.current;
    if (!container || document.hidden || parkedRef.current || visualRecoveryFrameRef.current !== null) return;
    const rect = container.getBoundingClientRect();
    if (
      rect.width < 20
      || rect.height < 20
      || rect.right <= 0
      || rect.bottom <= 0
      || rect.left >= window.innerWidth
      || rect.top >= window.innerHeight
    ) return;
    const recover = (remainingFrames: number) => {
      visualRecoveryFrameRef.current = requestAnimationFrame(() => {
        const xterm = xtermRef.current;
        if (!xterm) {
          visualRecoveryFrameRef.current = null;
          return;
        }
        fit();
        if (refreshTerminalNow(xterm) || remainingFrames <= 0) {
          visualRecoveryFrameRef.current = null;
          return;
        }
        recover(remainingFrames - 1);
      });
    };
    recover(4);
  }, [fit]);
  fitRef.current = fit;

  const hydrate = useCallback(async () => {
    const generation = ++hydrationRef.current;
    hydratingRef.current = true;
    reportStatus({ phase: 'hydrating' });
    pendingOutputRef.current = [];
    try {
      const snapshot = await client.getSnapshot(terminalId);
      const xterm = xtermRef.current;
      if (generation !== hydrationRef.current) return;
      if (!xterm) {
        hydratingRef.current = false;
        reportStatus({ phase: 'ready' });
        return;
      }
      const scrollGesture = scrollGestureRef.current;
      const scrollIntent = captureTerminalScrollIntent(xterm);
      // The server snapshot is complete until it reports truncation. Avoid
      // serializing and replaying a second copy of the same history on every
      // refresh; the rendered cache is only needed to bridge truncated raw
      // PTY history.
      if (snapshot?.truncated) cacheRenderedScrollback();
      xterm.reset();
      scrollbackFilterRef.current?.reset();
      sequenceRef.current = snapshot?.sequence ?? 0;
      const replay = drainHydrationOutput(
        pendingOutputRef.current,
        sequenceRef.current,
        (frame) => client.ackTerminal(frame),
      );
      pendingOutputRef.current = [];
      pendingOutputCharsRef.current = 0;
      const finish = () => {
        const live = xtermRef.current;
        if (generation !== hydrationRef.current || !live) return;
        const tail = drainHydrationOutput(
          pendingOutputRef.current,
          sequenceRef.current,
          (frame) => client.ackTerminal(frame),
        );
        pendingOutputRef.current = [];
        pendingOutputCharsRef.current = 0;
        for (const item of [...replay, ...tail]) {
          if (item.sequence <= sequenceRef.current) {
            client.ackTerminal(item);
            continue;
          }
          sequenceRef.current = item.sequence;
          renderControllerRef.current?.enqueue(item);
        }
        hydratingRef.current = false;
        reportStatus({ phase: 'ready' });
        renderControllerRef.current?.schedule();
        fit();
        refreshVisualState();
        cacheRenderedScrollback();
        if (scrollGestureRef.current === scrollGesture) {
          restoreTerminalScrollIntentAfterStructure(scrollIntentTarget(live), scrollIntent);
          let retries = 4;
          const retryRestore = () => {
            if (scrollGestureRef.current !== scrollGesture || retries <= 0) return;
            retries -= 1;
            requestAnimationFrame(() => {
              if (scrollGestureRef.current !== scrollGesture) return;
              restoreTerminalScrollIntentAfterStructure(scrollIntentTarget(live), scrollIntent);
              retryRestore();
            });
          };
          retryRestore();
        }
      };
      if (!snapshot) {
        reportStatus({ phase: 'ready' });
        finish();
        return;
      }
      const cachedHistory = snapshot.truncated ? recallTerminalScrollback(terminalId) : '';
      const replayBody = sanitizeTerminalOutput(scrollbackFilterRef.current?.filter(prependScrollback(
        cachedHistory,
        buildTerminalSnapshotReplay(snapshot),
      )) ?? '');
      if (!replayBody) {
        finish();
        return;
      }
      xterm.write(replayBody, finish);
      setError(null);
    } catch (cause) {
      hydratingRef.current = false;
      if (generation === hydrationRef.current) {
        const message = cause instanceof Error ? cause.message : 'Failed to restore terminal';
        setError(message);
        reportStatus({ phase: 'error', message });
      }
    }
  }, [cacheRenderedScrollback, client, fit, refreshVisualState, reportStatus, terminalId]);

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
    return attachTerminalEventBoundary(container, {
      markHandled: (event) => onInputEventRef.current?.(event),
    });
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    // A terminal can be mounted after the shared manager's initial connect
    // attempt (for example immediately after a board refresh or a new Agent
    // launch). Make the pane self-starting so it does not wait for a later
    // viewport interaction to kick the client.
    if (client.getConnectionState() !== 'connected') client.connect();
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
    if (terminalLinkResolvers.length === 0) {
      xterm.loadAddon(new WebLinksAddon((_event, uri) => window.open(uri, '_blank', 'noopener')));
    }
    const terminalQueryPolicy = installNestedTerminalQueryPolicy(xterm.parser);
    xterm.open(container);
    const scrollbackFilter = createTerminalScrollbackFilter();
    scrollbackFilterRef.current = scrollbackFilter;
    const resourceLinkOptions = {
      resolvers: terminalLinkResolvers,
      context: {
        cwd: terminalInfoRef.current?.cwd ?? '',
        terminalId,
        agentKind: terminalInfoRef.current?.agentKind,
      },
      capabilities: terminalResourceCapabilities,
      getContext: () => ({
        cwd: terminalInfoRef.current?.cwd ?? '',
        terminalId,
        agentKind: terminalInfoRef.current?.agentKind,
      }),
      onActivate: (resource: TerminalResourceRef, event: MouseEvent) => onResourceActivateRef.current?.(resource, event),
      openExternal: (url: string) => window.open(url, '_blank', 'noopener'),
    };
    const resourceLinkProvider = terminalLinkResolvers.length > 0
      ? createTerminalResourceLinksProvider(
          (line) => xterm.buffer.active.getLine(line)?.translateToString(true) ?? '',
          resourceLinkOptions,
        )
      : null;
    const resourceLinks = resourceLinkProvider
      ? xterm.registerLinkProvider(resourceLinkProvider)
      : null;
    const detachResourceLinkFallback = resourceLinkProvider
      ? installTerminalResourceLinkClickFallback(xterm, resourceLinkOptions)
      : () => {};
    const detachWheel = attachTerminalWheelController(xterm, container, {
      writeInput: (data) => {
        client.writeInput(terminalId, data);
      },
      onUserScroll: () => {
        scrollGestureRef.current += 1;
      },
    });
    const detachSelection = attachTerminalTextSelection(container, xterm);
    const detachPaste = attachTerminalPaste(container, (data) => {
      client.writeInput(terminalId, data);
    });
    guardViewportSync(xterm);
    const webglController = createTerminalWebglController({
      xterm,
      enabled: gpu,
      customGlyphs,
      isCold: () => presentationRef.current === 'cold',
      isActive: () => activeRef.current,
    });
    requestWebglRef.current = webglController.attach;
    releaseWebglRef.current = webglController.release;
    if (activeRef.current) webglController.attach();

    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;
    searchAddonRef.current = searchAddon;

    const scheduler = getTerminalOutputScheduler(client);
    const renderController = new TerminalRenderController({
      terminalId,
      client,
      isActive: () => (
        activeRef.current || inputPriorityUntilRef.current > performance.now()
      ) && !document.hidden && !parkedRef.current && presentationRef.current !== 'cold',
      isSuspended: () => isTerminalPresentationSuspended(presentationRef.current),
      writeBatch: (_batch, body, complete) => {
        xterm.write(sanitizeTerminalOutput(scrollbackFilter.filter(body)), () => {
          // xterm owns live scroll position. Once the user has touched the
          // viewport, restoring an intent captured before the write can race
          // xterm 6's async scrollable-element sync and snap the wheel back
          // to the bottom. Structural operations still restore intent below;
          // live output must leave the user's wheel position alone.
          scheduleScrollbackCache();
          complete();
        });
      },
    });
    renderControllerRef.current = renderController;
    renderController.attach(scheduler);
    const unregisterPerformanceSource = registerTerminalPerformanceSource(
      terminalId,
      () => terminalPerformanceSnapshotFromStats(renderController.getStats(), {
        terminalId,
        presentation: presentationRef.current,
        active: activeRef.current,
        webgl: webglController.isAttached(),
      }),
    );


    const sendShortcut = (event: KeyboardEvent): boolean => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && xterm.hasSelection()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void navigator.clipboard.writeText(xterm.getSelection());
        return true;
      }
      const shortcut = terminalShortcutInput(event);
      if (!shortcut) return false;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!client.writeInput(terminalId, shortcut)) {
        const message = 'Terminal connection is not ready';
        setError(message);
        reportStatus({ phase: 'error', message });
      }
      return true;
    };
    const onWindowKeyDown = (event: KeyboardEvent) => {
      if (!isTerminalShortcutTarget(container, event.target)) return;
      sendShortcut(event);
    };
    window.addEventListener('keydown', onWindowKeyDown, true);
    xterm.attachCustomKeyEventHandler((event) => {
      if (event.type !== 'keydown') return true;
      return sendShortcut(event) ? false : true;
    });

    const dataDisposable = xterm.onData((data) => {
      if (!document.hidden && !parkedRef.current && presentationRef.current !== 'cold') {
        inputPriorityUntilRef.current = performance.now() + 750;
        renderControllerRef.current?.setSuspended(false);
        renderControllerRef.current?.schedule();
        requestWebglRef.current?.();
      }
      const next = detachPaste.prepareInput(data);
      if (next === null) return;
      if (!client.writeInput(terminalId, next)) {
        const message = 'Terminal connection is not ready';
        setError(message);
        reportStatus({ phase: 'error', message });
      }
    });
    const focusListener = () => onFocusRef.current?.();
    container.addEventListener('pointerdown', focusListener);

    const unsubscribeOutput = client.subscribeToOutput(terminalId, (frame) => {
      const { sequence } = frame;
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
      if (document.hidden || parkedRef.current || presentationRef.current === 'cold') {
        client.ackTerminal(frame);
        return;
      }
      if (sequence <= sequenceRef.current) {
        client.ackTerminal(frame);
        return;
      }
      sequenceRef.current = sequence;
      renderControllerRef.current?.enqueue(frame);
    });
    const unsubscribeExit = client.subscribeToExit(terminalId, (code) => {
      setExitCode(code);
      reportStatus({ phase: 'exited', exitCode: code });
      onExitRef.current?.(code);
    });
    const unsubscribeConnection = client.subscribeToConnection((state) => {
      setConnection(state);
      reportStatus({
        phase: state === 'connected' ? 'hydrating' : state === 'connecting' ? 'connecting' : 'reconnecting',
      });
      if (state === 'connected') void requestHydrate();
    });
    // Terminal panes are commonly mounted after the shared client has already
    // connected and the inventory has rendered. In that case no future
    // connection event fires, so waiting only on the subscription would leave
    // the pane with live output but no historical snapshot.
    if (client.getConnectionState() === 'connected') {
      void requestHydrate();
    }

    let cancelled = false;
    const observer = new ResizeObserver(() => {
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      resizeFrameRef.current = requestAnimationFrame(() => {
        resizeFrameRef.current = null;
        fit();
        evaluatePresentationRef.current?.();
      });
    });
    observer.observe(container);
    const updatePresentation = (intersecting: boolean) => {
      const rect = container.getBoundingClientRect();
      const next = resolveTerminalPresentation({
        active: activeRef.current,
        parked: parkedRef.current,
        documentVisible: !document.hidden,
        intersecting,
        zoom: cameraZoomRef.current,
        physicalWidth: rect.width,
        physicalHeight: rect.height,
      });
      const previous = presentationRef.current;
      presentationRef.current = next;
      renderController.setSuspended(isTerminalPresentationSuspended(next));
      if (next !== 'cold' && activeRef.current) requestWebglRef.current?.();
      if (previous === next) return;
      if (next === 'cold') {
        void client.pauseTerminal(terminalId).catch(() => false);
        return;
      }
      if (previous === 'cold') {
        void client.resumeTerminal(terminalId)
          .catch(() => false)
          .finally(() => {
            if (presentationRef.current === next) void requestHydrate().finally(refreshVisualState);
          });
      }
    };
    let intersecting = true;
    evaluatePresentationRef.current = () => updatePresentation(intersecting);
    updatePresentation(intersecting);
    const visibilityObserver = new IntersectionObserver((entries) => {
      const entry = entries[entries.length - 1];
      intersecting = entry?.isIntersecting === true;
      updatePresentation(intersecting);
      if (intersecting) refreshVisualState();
    }, { threshold: 0.01 });
    visibilityObserver.observe(container);

    // tldraw may mount the HTML shape before its transformed container has a
    // measurable size. In that window presentation resolves to `cold`, which
    // pauses the stream; relying only on ResizeObserver/IntersectionObserver
    // leaves it stuck until the user pans the board. Re-evaluate for a bounded
    // number of frames while the initial layout settles.
    let presentationFrame: number | null = null;
    let presentationRetries = 0;
    const retryInitialPresentation = () => {
      presentationFrame = null;
      if (cancelled) return;
      const rect = container.getBoundingClientRect();
      // IntersectionObserver can publish an early `false` while tldraw is
      // still moving the HTML shape into its transformed layer. Once the
      // element has a real box, use the viewport geometry as the authoritative
      // first-layout signal instead of waiting for a later pan.
      if (rect.width >= 20 && rect.height >= 20) {
        intersecting = rect.right > 0
          && rect.bottom > 0
          && rect.left < window.innerWidth
          && rect.top < window.innerHeight;
      }
      evaluatePresentationRef.current?.();
      fit();
      if (presentationRetries < 18) {
        presentationRetries += 1;
        presentationFrame = requestAnimationFrame(retryInitialPresentation);
      }
    };
    presentationFrame = requestAnimationFrame(retryInitialPresentation);

    return () => {
      cancelled = true;
      hydrationRef.current += 1;
      observer.disconnect();
      visibilityObserver.disconnect();
      evaluatePresentationRef.current = null;
      if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current);
      if (fitRetryFrameRef.current !== null) cancelAnimationFrame(fitRetryFrameRef.current);
      if (visualRecoveryFrameRef.current !== null) cancelAnimationFrame(visualRecoveryFrameRef.current);
      if (presentationFrame !== null) cancelAnimationFrame(presentationFrame);
      if (scrollbackCacheTimerRef.current !== null) clearTimeout(scrollbackCacheTimerRef.current);
      scrollbackCacheTimerRef.current = null;
      cacheRenderedScrollback();
      visualRecoveryFrameRef.current = null;
      fitRetryFrameRef.current = null;
      fitProposalRef.current = null;
      resourceLinks?.dispose();
      resourceLinkProvider?.disposeValidation();
      detachResourceLinkFallback();
      detachWheel();
      detachSelection();
      detachPaste();
      unsubscribeOutput();
      unsubscribeExit();
      unsubscribeConnection();
      renderController.dispose();
      renderControllerRef.current = null;
      unregisterPerformanceSource();
      webglController.release();
      requestWebglRef.current = null;
      releaseWebglRef.current = null;
      container.removeEventListener('pointerdown', focusListener);
      window.removeEventListener('keydown', onWindowKeyDown, true);
      dataDisposable.dispose();
      terminalQueryPolicy.dispose();
      unicode11Addon.dispose();
      xtermRef.current = null;
      scrollbackFilterRef.current = null;
      fitAddonRef.current = null;
      searchAddonRef.current = null;
      try {
        xterm.dispose();
      } catch {
        // Pending Viewport timeout may run against a disposed renderer.
      }
    };
  }, [cacheRenderedScrollback, client, customGlyphs, fit, gpu, refreshVisualState, requestHydrate, scheduleScrollbackCache, terminalId]);

  useEffect(() => {
    const syncPresentation = () => {
      evaluatePresentationRef.current?.();
      if (active) requestWebglRef.current?.();
      else releaseWebglRef.current?.();
    };
    syncPresentation();
    document.addEventListener('visibilitychange', syncPresentation);
    window.addEventListener('focus', syncPresentation);
    window.addEventListener('pageshow', syncPresentation);
    return () => {
      document.removeEventListener('visibilitychange', syncPresentation);
      window.removeEventListener('focus', syncPresentation);
      window.removeEventListener('pageshow', syncPresentation);
    };
  }, [active, parked, cameraZoom]);
  useEffect(() => {
    const xterm = xtermRef.current;
    if (!xterm) return;
    xterm.options.fontFamily = resolved.fontFamily;
    xterm.options.fontSize = resolved.fontSize;
    xterm.options.lineHeight = 1;
    xterm.options.fontWeight = TERMINAL_FONT_WEIGHT;
    xterm.options.fontWeightBold = TERMINAL_FONT_WEIGHT_BOLD;
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
    <div
      className="bac-term relative h-full w-full overflow-hidden"
      style={{
        background: resolved.theme.background,
        // 行间补缝 CSS 读取这个变量。必须和主题背景是同一个值。
        '--bac-term-bg': resolved.theme.background,
      } as CSSProperties}
    >
      <div ref={containerRef} className="h-full w-full" />
      {searchOpen && (
        <TerminalSearchOverlay
          searchTerm={searchTerm}
          searchAddon={searchAddonRef.current}
          onSearchTermChange={setSearchTerm}
          onClose={() => setSearchOpen(false)}
        />
      )}
      <TerminalStatusOverlays
        connection={connection}
        exitCode={exitCode}
        error={error}
        onDismissError={() => setError(null)}
      />
    </div>
  );
});
