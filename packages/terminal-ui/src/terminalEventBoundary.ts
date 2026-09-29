/**
 * Events originating inside a terminal belong to the terminal, not to the
 * surrounding canvas.
 *
 * Every owned event is marked for the host integration (tldraw uses
 * `editor.markEventAsHandled`). Events whose complete lifecycle is local to
 * the terminal also stop at this bubble-phase boundary. Pointer/mouse/touch
 * continuation events remain propagating because xterm 6 uses window-level
 * listeners for scrollbar dragging and selection; the handled marker keeps
 * the canvas from interpreting them.
 *
 * Never call preventDefault here. Only the terminal feature that consumes the
 * event may cancel browser behavior.
 */

export const TERMINAL_OWNED_EVENT_TYPES = [
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'input',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'copy',
  'cut',
  'paste',
  'selectstart',
  'pointerdown',
  'pointermove',
  'pointerup',
  'pointercancel',
  'pointerover',
  'pointerout',
  'gotpointercapture',
  'lostpointercapture',
  'mousedown',
  'mousemove',
  'mouseup',
  'mouseover',
  'mouseout',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'wheel',
  'touchstart',
  'touchmove',
  'touchend',
  'touchcancel',
  'dragstart',
  'drag',
  'dragend',
  'dragenter',
  'dragover',
  'dragleave',
  'drop',
] as const;

export const TERMINAL_STOPPED_EVENT_TYPES = new Set<string>([
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'input',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'copy',
  'cut',
  'paste',
  'selectstart',
  'pointerdown',
  'mousedown',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'wheel',
  'touchstart',
  'dragstart',
  'dragenter',
  'dragover',
  'dragleave',
  'drop',
]);

interface EventBoundaryTarget {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface TerminalEventBoundaryOptions {
  markHandled?: (event: Event) => void;
}

export function attachTerminalEventBoundary(
  root: EventBoundaryTarget,
  options: TerminalEventBoundaryOptions = {},
): () => void {
  const ownTerminalEvent: EventListener = (event) => {
    options.markHandled?.(event);
    if (TERMINAL_STOPPED_EVENT_TYPES.has(event.type)) event.stopPropagation();
  };
  for (const type of TERMINAL_OWNED_EVENT_TYPES) {
    root.addEventListener(type, ownTerminalEvent);
  }
  return () => {
    for (const type of TERMINAL_OWNED_EVENT_TYPES) {
      root.removeEventListener(type, ownTerminalEvent);
    }
  };
}
