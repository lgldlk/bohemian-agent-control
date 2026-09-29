import type { Terminal as XTerm } from '@xterm/xterm';
import { isCorruptTerminalScroll } from './viewport';

type XtermViewport = {
  syncScrollArea?: (...args: unknown[]) => void;
  queueSync?: (ydisp?: number) => void;
  scrollToLine?: (line: number, disableSmoothScroll?: boolean) => void;
  _viewportElement?: HTMLElement;
  _currentRowHeight?: number;
};

type XtermRenderService = {
  _isPaused?: boolean;
  hasRenderer(): boolean;
  refreshRows(start: number, end: number, sync?: boolean): void;
};

export function refreshTerminalNow(xterm: XTerm): boolean {
  const renderService = (xterm as XTerm & {
    _core?: { _renderService?: XtermRenderService };
  })._core?._renderService;
  if (!renderService?.hasRenderer() || renderService._isPaused) return false;
  renderService.refreshRows(0, Math.max(0, xterm.rows - 1), true);
  return true;
}

function getXtermViewport(xterm: XTerm): XtermViewport | undefined {
  return (xterm as XTerm & { _core?: { viewport?: XtermViewport } })._core?.viewport;
}

export function scrollIntentTarget(xterm: XTerm) {
  const viewport = getXtermViewport(xterm);
  return {
    buffer: xterm.buffer,
    scrollToLine: (line: number, disableSmoothScroll?: boolean) => {
      if (viewport?.scrollToLine) viewport.scrollToLine(line, disableSmoothScroll);
      else xterm.scrollToLine(line);
    },
    syncScrollArea: () => {
      if (viewport?.queueSync) viewport.queueSync(xterm.buffer.active.viewportY);
      else viewport?.syncScrollArea?.(true, true);
    },
  };
}

/**
 * xterm treats a transformed/hidden parent's scrollTop=0 as "user went to top".
 * Keep this workaround isolated from the terminal lifecycle so the component
 * does not need to know xterm's private viewport implementation details.
 */
export function guardViewportSync(xterm: XTerm) {
  const viewport = getXtermViewport(xterm);
  if (!viewport) return;
  if (viewport.syncScrollArea) {
    const original = viewport.syncScrollArea.bind(viewport);
    viewport.syncScrollArea = (...args: unknown[]) => {
      try {
        original(...args);
      } catch {
        // xterm can schedule a viewport sync while React disposes the renderer.
      }
    };
  }

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
