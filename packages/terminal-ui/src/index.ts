export { Terminal } from './components/Terminal';
export type { TerminalHandle } from './components/Terminal';
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
