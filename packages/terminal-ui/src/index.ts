export { Terminal } from './components/Terminal';
export type { TerminalHandle, TerminalRuntimePhase, TerminalRuntimeState } from './components/Terminal';
export type { TerminalResourceRef } from '@bohemian/terminal-protocol';
export type {
  TerminalLinkContext,
  TerminalLocalResourceStat,
  TerminalResourceLinkCapabilities,
  TerminalResourceLinkMatch,
  TerminalResourceLinkResolver,
} from './terminalResources';
export { TerminalModal } from './components/TerminalModal';
export { TerminalHistoryPanel } from './components/TerminalHistoryPanel';
export { TerminalWorkspace } from './components/TerminalWorkspace';
export type { TerminalWorkspaceProps } from './components/TerminalWorkspace';
export { TerminalAppearanceMenu } from './components/TerminalAppearanceMenu';
export { useTerminalManager } from './hooks/useTerminalManager';
export {
  DEFAULT_TERMINAL_APPEARANCE,
  TERMINAL_FONTS,
  TERMINAL_THEMES,
  resolveTerminalAppearance,
  useTerminalAppearance,
} from './appearance';
export type { TerminalAppearance, TerminalCursorStyle, TerminalFontId, TerminalThemeId } from './appearance';
export {
  collectTerminalIds,
  removeTerminalLeaf,
  replaceMissingTerminalIds,
  splitTerminalLeaf,
  terminalLeaf,
  updateSplitRatio,
} from './layout';
export type { TerminalLayoutNode, TerminalSplitDirection } from './layout';
export { getTerminalOutputScheduler, TerminalOutputScheduler } from './terminalOutputScheduler';
export { TerminalRenderController } from './terminalRenderController';
export type { TerminalRenderControllerOptions, TerminalRenderControllerStats } from './terminalRenderController';
export {
  isTerminalPresentationSuspended,
  resolveTerminalPresentation,
  TERMINAL_COLD_HEIGHT,
  TERMINAL_COLD_WIDTH,
  TERMINAL_COLD_ZOOM,
} from './terminalPresentation';
export type { TerminalPresentationInput, TerminalPresentationState } from './terminalPresentation';
export { acquireTerminalWebglLease, activeTerminalWebglLeases, MAX_ACTIVE_TERMINAL_WEBGL_LEASES } from './terminalWebglLease';
export {
  getTerminalPerformanceHistory,
  getTerminalPerformanceSnapshot,
  subscribeTerminalPerformance,
} from './terminalPerformance';
export type {
  TerminalPerformanceHistoryPoint,
  TerminalPerformanceSnapshot,
  TerminalPerformanceTerminal,
} from './terminalPerformance';

export { createDebouncedTask, createRafScheduler } from './timing';
export type { DebouncedTask, RafScheduler } from './timing';
