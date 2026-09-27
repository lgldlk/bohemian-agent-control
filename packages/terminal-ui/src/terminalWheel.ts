/**
 * Wheel policy for an embedded xterm.
 *
 * A fullscreen TUI may not keep xterm scrollback and may temporarily disable
 * mouse tracking. In that state PageUp/PageDown is the portable CLI-level
 * scroll command; ArrowUp/ArrowDown is deliberately never synthesized.
 */

export interface WheelDelta {
  deltaY: number;
  deltaMode: number;
}

const HANDLED = '__bacTerminalWheelHandled';
const REPLAYED_TUI_WHEEL = '__bacReplayedTuiWheel';
const DEFAULT_CELL_HEIGHT = 16;

type ReplayedWheelEvent = WheelEvent & { [REPLAYED_TUI_WHEEL]?: boolean };
type TuiWheelState = { pendingRows: number };
type TuiReplayState = { scheduled: boolean; event: WheelEvent | null; reports: number };

export function wheelLineDelta(event: WheelDelta): number {
  if (!Number.isFinite(event.deltaY) || event.deltaY === 0) return 0;
  const unit = event.deltaMode === 1 ? 1 : event.deltaMode === 2 ? 3 : 1 / 16;
  const lines = Math.max(1, Math.round(Math.abs(event.deltaY) * unit));
  return event.deltaY < 0 ? -lines : lines;
}

export interface WheelTerminalState {
  mouseTrackingMode: string;
  hasScrollback: boolean;
  bufferType: 'normal' | 'alternate';
}

function pageReportsForWheel(event: WheelDelta): number {
  const lines = Math.max(1, Math.abs(wheelLineDelta(event)));
  return Math.min(8, Math.max(1, Math.round(lines / 3)));
}

function resolveTuiCellHeight(terminal: WheelTerminal): number {
  const screen = terminal.element?.querySelector<HTMLElement>('.xterm-screen');
  const rect = screen?.getBoundingClientRect();
  return rect && rect.height > 0
    ? rect.height / Math.max(1, terminal.rows ?? 1)
    : DEFAULT_CELL_HEIGHT;
}

function resolveTuiReportCount(event: WheelEvent, terminal: WheelTerminal, state: TuiWheelState): number {
  const distance = event.deltaMode === 1
    ? Math.abs(event.deltaY)
    : event.deltaMode === 2
      ? Math.abs(event.deltaY) * Math.max(1, terminal.rows ?? 1)
      : Math.abs(event.deltaY) / resolveTuiCellHeight(terminal);
  const total = state.pendingRows + distance;
  const reports = Math.floor(total);
  state.pendingRows = total - reports;
  return reports;
}

function replayTuiWheelEvent(event: WheelEvent): WheelEvent {
  const replay = new WheelEvent(event.type, {
    bubbles: event.bubbles,
    cancelable: event.cancelable,
    composed: event.composed,
    clientX: event.clientX,
    clientY: event.clientY,
    deltaY: event.deltaY < 0 ? -1 : 1,
    deltaMode: 1,
    shiftKey: event.shiftKey,
    ctrlKey: event.ctrlKey,
    altKey: event.altKey,
    metaKey: event.metaKey,
  }) as ReplayedWheelEvent;
  Object.defineProperty(replay, REPLAYED_TUI_WHEEL, { configurable: true, value: true });
  return replay;
}

function queueTuiReports(
  terminal: WheelTerminal,
  event: WheelEvent,
  reports: number,
  state: TuiReplayState,
): void {
  state.event = event;
  state.reports += reports;
  if (state.scheduled) return;
  state.scheduled = true;
  queueMicrotask(() => {
    state.scheduled = false;
    const source = state.event;
    const count = state.reports;
    state.event = null;
    state.reports = 0;
    if (!source || !terminal.element || terminal.modes.mouseTrackingMode === 'none') return;
    for (let index = 0; index < count; index += 1) {
      terminal.element.dispatchEvent(replayTuiWheelEvent(source));
    }
  });
}

export type WheelAction = 'tui-report' | 'local-scroll' | 'page-up' | 'page-down' | 'block';

export function resolveWheelAction(state: WheelTerminalState, deltaY: number): WheelAction {
  // History in the normal buffer is the scrollbar. Scroll that before any TUI
  // mouse report, or the wheel never moves the thumb.
  if (state.bufferType !== 'alternate' && state.hasScrollback) return 'local-scroll';
  if (state.bufferType === 'alternate') return deltaY < 0 ? 'page-up' : 'page-down';
  if (state.mouseTrackingMode !== 'none') return 'tui-report';
  return 'block';
}

export function shouldForwardWheelToPty(state: WheelTerminalState): boolean {
  if (state.bufferType !== 'alternate' && state.hasScrollback) return false;
  return state.mouseTrackingMode !== 'none';
}

export function consumeTerminalWheel(
  terminal: { scrollLines(delta: number): void },
  event: WheelEvent,
): void {
  const marked = event as WheelEvent & { [HANDLED]?: boolean };
  if (marked[HANDLED]) return;
  marked[HANDLED] = true;
  event.preventDefault();
  event.stopPropagation();
  const lines = wheelLineDelta(event);
  if (lines !== 0) terminal.scrollLines(lines);
}

export function consumeTerminalWheelWithoutScroll(event: WheelEvent): void {
  const marked = event as WheelEvent & { [HANDLED]?: boolean };
  if (marked[HANDLED]) return;
  marked[HANDLED] = true;
  event.preventDefault();
  event.stopPropagation();
}

type WheelTerminal = {
  element?: HTMLElement | null;
  modes: { mouseTrackingMode: string };
  buffer: { active: { baseY: number; type: 'normal' | 'alternate' } };
  rows?: number;
  scrollLines(delta: number): void;
  input(data: string): void;
  focus(): void;
  attachCustomWheelEventHandler(handler: (event: WheelEvent) => boolean): void;
};

type WheelControllerOptions = {
  writeInput?: (data: string) => void;
};

function stateOf(terminal: WheelTerminal): WheelTerminalState {
  return {
    mouseTrackingMode: terminal.modes.mouseTrackingMode,
    hasScrollback: terminal.buffer.active.baseY > 0,
    bufferType: terminal.buffer.active.type,
  };
}

function handleWheel(
  terminal: WheelTerminal,
  event: WheelEvent,
  options: WheelControllerOptions,
  tuiState: TuiWheelState,
  tuiReplay: TuiReplayState,
): void {
  const state = stateOf(terminal);
  const replayed = (event as ReplayedWheelEvent)[REPLAYED_TUI_WHEEL] === true;
  if (!replayed && state.bufferType === 'alternate' && state.mouseTrackingMode !== 'none' && !event.shiftKey) {
    const reports = resolveTuiReportCount(event, terminal, tuiState);
    if (reports > 0) {
      event.preventDefault();
      event.stopPropagation();
      queueTuiReports(terminal, event, reports, tuiReplay);
      return;
    }
  }
  const action = resolveWheelAction(state, event.deltaY);
  if (action === 'tui-report') return;
  if (action === 'local-scroll') {
    consumeTerminalWheel(terminal, event);
    return;
  }
  consumeTerminalWheelWithoutScroll(event);
  terminal.focus();
  if (action === 'page-up' || action === 'page-down') {
    const report = action === 'page-up' ? '\u001b[5~' : '\u001b[6~';
    for (let index = 0; index < pageReportsForWheel(event); index += 1) {
      (options.writeInput ?? terminal.input)(report);
    }
  }
}

export function attachTerminalWheelController(
  terminal: WheelTerminal,
  root: HTMLElement,
  options: WheelControllerOptions = {},
): () => void {
  const tuiState: TuiWheelState = { pendingRows: 0 };
  const tuiReplay: TuiReplayState = { scheduled: false, event: null, reports: 0 };
  const onWheel = (event: WheelEvent) => handleWheel(terminal, event, options, tuiState, tuiReplay);
  terminal.attachCustomWheelEventHandler((event) => {
    if (shouldForwardWheelToPty(stateOf(terminal))) return true;
    handleWheel(terminal, event, options, tuiState, tuiReplay);
    return false;
  });
  root.addEventListener('wheel', onWheel, { capture: true, passive: false });
  terminal.element?.addEventListener('wheel', onWheel, { capture: true, passive: false });
  return () => {
    root.removeEventListener('wheel', onWheel, true);
    terminal.element?.removeEventListener('wheel', onWheel, true);
  };
}
