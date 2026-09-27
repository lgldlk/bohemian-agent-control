/**
 * Pointer coordinates for an embedded terminal.
 *
 * tldraw scales the terminal with a CSS transform. xterm converts
 * `clientX - rect.left` into a cell using the unscaled cell size, so drag
 * selection and TUI mouse hits land on the wrong row. This module corrects
 * that scale and nothing else.
 */

const CORRECTED = '__bacPointerCorrected';

export interface ElementBox {
  rectLeft: number;
  rectTop: number;
  rectWidth: number;
  rectHeight: number;
  offsetWidth: number;
  offsetHeight: number;
}

export function scaleForBox(box: ElementBox): { x: number; y: number } {
  return {
    x: box.rectWidth > 0 ? box.offsetWidth / box.rectWidth : 1,
    y: box.rectHeight > 0 ? box.offsetHeight / box.rectHeight : 1,
  };
}

export function correctedClientPoint(box: ElementBox, clientX: number, clientY: number): { x: number; y: number } {
  const scale = scaleForBox(box);
  return {
    x: box.rectLeft + (clientX - box.rectLeft) * scale.x,
    y: box.rectTop + (clientY - box.rectTop) * scale.y,
  };
}

function boxOf(element: HTMLElement): ElementBox {
  const rect = element.getBoundingClientRect();
  return {
    rectLeft: rect.left,
    rectTop: rect.top,
    rectWidth: rect.width,
    rectHeight: rect.height,
    offsetWidth: element.offsetWidth,
    offsetHeight: element.offsetHeight,
  };
}

function needsCorrection(box: ElementBox): boolean {
  const scale = scaleForBox(box);
  return Math.abs(scale.x - 1) > 0.01 || Math.abs(scale.y - 1) > 0.01;
}

export function attachTerminalPointerCorrection(root: HTMLElement): () => void {
  const correct = (event: MouseEvent) => {
    if (event[CORRECTED as keyof MouseEvent]) return;
    const screen = root.querySelector('.xterm-screen');
    if (!(screen instanceof HTMLElement)) return;
    const box = boxOf(screen);
    if (!needsCorrection(box)) return;
    event.stopImmediatePropagation();
    event.preventDefault();
    const point = correctedClientPoint(box, event.clientX, event.clientY);
    const next = new MouseEvent(event.type, {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: point.x,
      clientY: point.y,
      screenX: event.screenX,
      screenY: event.screenY,
      button: event.button,
      buttons: event.buttons,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      metaKey: event.metaKey,
    });
    Object.defineProperty(next, CORRECTED, { value: true });
    screen.dispatchEvent(next);
  };
  root.addEventListener('mousedown', correct, true);
  root.addEventListener('mousemove', correct, true);
  root.addEventListener('mouseup', correct, true);
  return () => {
    root.removeEventListener('mousedown', correct, true);
    root.removeEventListener('mousemove', correct, true);
    root.removeEventListener('mouseup', correct, true);
  };
}
