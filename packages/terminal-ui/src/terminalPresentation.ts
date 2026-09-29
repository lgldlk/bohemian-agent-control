export type TerminalPresentationState = 'cold' | 'warm' | 'hot';

export interface TerminalPresentationInput {
  active: boolean;
  parked: boolean;
  documentVisible: boolean;
  intersecting: boolean;
  zoom: number;
  physicalWidth: number;
  physicalHeight: number;
}

export const TERMINAL_COLD_ZOOM = 0.25;
export const TERMINAL_COLD_WIDTH = 160;
export const TERMINAL_COLD_HEIGHT = 72;

export function resolveTerminalPresentation(input: TerminalPresentationInput): TerminalPresentationState {
  if (input.parked || !input.documentVisible || !input.intersecting) return 'cold';
  // Interaction latency wins over thumbnail heuristics. A focused terminal
  // must remain hot even when the board camera makes it physically small.
  if (input.active) return 'hot';
  if (
    input.zoom < TERMINAL_COLD_ZOOM
    || input.physicalWidth < TERMINAL_COLD_WIDTH
    || input.physicalHeight < TERMINAL_COLD_HEIGHT
  ) return 'cold';
  return 'warm';
}

export function isTerminalPresentationSuspended(state: TerminalPresentationState): boolean {
  return state === 'cold';
}
