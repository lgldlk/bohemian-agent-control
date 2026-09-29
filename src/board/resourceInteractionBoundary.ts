const RESOURCE_INTERACTION_EVENTS = [
  'pointerdown', 'pointerup', 'pointermove', 'pointercancel',
  'mousedown', 'mouseup', 'mousemove', 'click', 'dblclick', 'contextmenu',
  'keydown', 'keyup', 'copy', 'cut', 'paste',
  'touchstart', 'touchmove', 'touchend', 'dragstart',
] as const;

export function attachResourceInteractionBoundary(
  element: HTMLElement,
  onActivate: () => void,
): () => void {
  const stopCanvas = (event: Event) => event.stopPropagation();
  element.addEventListener('pointerenter', onActivate);
  element.addEventListener('wheel', stopCanvas, { passive: true });
  RESOURCE_INTERACTION_EVENTS.forEach((type) => element.addEventListener(type, stopCanvas));
  return () => {
    element.removeEventListener('pointerenter', onActivate);
    element.removeEventListener('wheel', stopCanvas);
    RESOURCE_INTERACTION_EVENTS.forEach((type) => element.removeEventListener(type, stopCanvas));
  };
}
