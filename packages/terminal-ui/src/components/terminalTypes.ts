import type { TerminalClient } from '@bohemian/terminal-client';
import type { TerminalInfo } from '@bohemian/terminal-protocol';
import type {
  TerminalResourceLinkCapabilities,
  TerminalResourceLinkResolver,
  TerminalResourceRef,
} from '../terminalResources';

export interface TerminalHandle {
  focus(): void;
  blur(): void;
  fit(): void;
  openSearch(): void;
  copy(): Promise<void>;
  paste(): Promise<void>;
  selectAll(): void;
  clear(): Promise<void>;
}

export type TerminalRuntimePhase =
  | 'loading'
  | 'connecting'
  | 'hydrating'
  | 'ready'
  | 'reconnecting'
  | 'exited'
  | 'error';

export interface TerminalRuntimeState {
  phase: TerminalRuntimePhase;
  message?: string;
  exitCode?: number | null;
}

export interface TerminalProps {
  terminalId: string;
  client: TerminalClient;
  active?: boolean;
  /** Skip live rendering while the owning surface is hidden/minimized. */
  parked?: boolean;
  /** One WebGL canvas, as Orca does. DOM rows are slower and split box-drawing at each row. */
  gpu?: boolean;
  /** Generate continuous box-drawing glyphs for canvas-scaled board terminals. */
  customGlyphs?: boolean;
  onFocus?: () => void;
  /** Mark a terminal-owned DOM event so an embedding canvas ignores it. */
  onInputEvent?: (event: Event) => void;
  onExit?: (code: number | null) => void;
  onResourceActivate?: (resource: TerminalResourceRef, event: MouseEvent) => void;
  terminalLinkResolvers?: readonly TerminalResourceLinkResolver[];
  terminalResourceCapabilities?: TerminalResourceLinkCapabilities;
  terminalInfo?: Pick<TerminalInfo, 'cwd' | 'agentKind'>;
  cameraZoom?: number;
  onStatusChange?: (state: TerminalRuntimeState) => void;
}
