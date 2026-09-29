/**
 * Drag selection for an embedded terminal.
 *
 * xterm maps mouse events through the unscaled screen box. Inside a transformed
 * tldraw shape that size does not match the painted terminal, so the highlight
 * lands on the wrong row. This module hits the xterm screen box directly and
 * writes the selection itself.
 */

export interface SelectionPoint {
  col: number;
  row: number;
}

export function cellFromScreenPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  cols: number,
  rows: number,
  cell?: { width: number; height: number; offsetWidth?: number; offsetHeight?: number },
): SelectionPoint | null {
  if (rect.width <= 0 || rect.height <= 0 || cols <= 0 || rows <= 0) return null;
  const scaleX = cell?.offsetWidth && cell.offsetWidth > 0 ? cell.offsetWidth / rect.width : 1;
  const scaleY = cell?.offsetHeight && cell.offsetHeight > 0 ? cell.offsetHeight / rect.height : 1;
  const localX = (clientX - rect.left) * scaleX;
  const localY = (clientY - rect.top) * scaleY;
  const cellWidth = cell?.width && cell.width > 0 ? cell.width : (rect.width * scaleX) / cols;
  const cellHeight = cell?.height && cell.height > 0 ? cell.height : (rect.height * scaleY) / rows;
  if (localX < 0 || localY < 0 || localX >= cols * cellWidth || localY >= rows * cellHeight) return null;
  return {
    col: Math.min(cols - 1, Math.floor(localX / cellWidth)),
    row: Math.min(rows - 1, Math.floor(localY / cellHeight)),
  };
}

type SelectionModel = {
  selectionStart: [number, number] | undefined;
  selectionEnd: [number, number] | undefined;
  selectionStartLength?: number;
  isSelectAllActive?: boolean;
};

type SelectionTerminal = {
  cols: number;
  rows: number;
  buffer: { active: { viewportY: number } };
  element?: HTMLElement | null;
  focus(): void;
  clearSelection(): void;
};

function selectionModel(terminal: SelectionTerminal): { model: SelectionModel; refresh: () => void } | null {
  const core = (terminal as SelectionTerminal & {
    _core?: { _selectionService?: { _model?: SelectionModel; refresh?: (force?: boolean) => void } };
  })._core;
  const service = core?._selectionService;
  if (!service?._model || !service.refresh) return null;
  return { model: service._model, refresh: () => service.refresh?.(true) };
}

export function applyTerminalSelection(
  terminal: SelectionTerminal,
  anchor: SelectionPoint,
  current: SelectionPoint,
  viewportY: number,
): void {
  const target = selectionModel(terminal);
  if (!target) return;
  target.model.isSelectAllActive = false;
  // Hit-testing already uses the painted screen box. Do not subtract a row here:
  // a fixed -1 bias highlights the line above the glyphs.
  const startRow = Math.min(terminal.rows - 1, Math.max(0, anchor.row));
  const endRow = Math.min(terminal.rows - 1, Math.max(0, current.row));
  target.model.selectionStart = [anchor.col, startRow + viewportY];
  target.model.selectionStartLength = 0;
  target.model.selectionEnd = [Math.min(terminal.cols, current.col + 1), endRow + viewportY];
  target.refresh();
}

export function attachTerminalTextSelection(root: HTMLElement, terminal: SelectionTerminal): () => void {
  let anchor: SelectionPoint | null = null;
  let dragging = false;

  const paintedScreen = () => {
    const screen = root.querySelector('.xterm-screen');
    return screen instanceof HTMLElement && screen.offsetHeight > 0 ? screen : null;
  };

  const pointAt = (event: MouseEvent): SelectionPoint | null => {
    const screen = paintedScreen();
    if (!screen) return null;
    const size = (terminal as SelectionTerminal & {
      _core?: { _renderService?: { dimensions?: { css?: { cell?: { width: number; height: number } } } } };
    })._core?._renderService?.dimensions?.css?.cell;
    return cellFromScreenPoint(
      event.clientX,
      event.clientY,
      screen.getBoundingClientRect(),
      terminal.cols,
      terminal.rows,
      size && size.width > 0 && size.height > 0
        ? { ...size, offsetWidth: screen.offsetWidth, offsetHeight: screen.offsetHeight }
        : undefined,
    );
  };

  const onMouseDown = (event: MouseEvent) => {
    if (event.button !== 0) return;
    const point = pointAt(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    terminal.focus();
    anchor = point;
    dragging = true;
    terminal.clearSelection();
  };

  const onMouseMove = (event: MouseEvent) => {
    if (!dragging || !anchor || (event.buttons & 1) === 0) return;
    const point = pointAt(event);
    if (!point) return;
    event.preventDefault();
    event.stopPropagation();
    applyTerminalSelection(terminal, anchor, point, terminal.buffer.active.viewportY);
  };

  const onMouseUp = () => {
    dragging = false;
    anchor = null;
  };

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if (!pointAt(event)) return;
    event.stopPropagation();
  };

  root.addEventListener('pointerdown', onPointerDown, true);
  root.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
  return () => {
    root.removeEventListener('pointerdown', onPointerDown, true);
    root.removeEventListener('mousedown', onMouseDown, true);
    window.removeEventListener('mousemove', onMouseMove, true);
    window.removeEventListener('mouseup', onMouseUp, true);
  };
}
