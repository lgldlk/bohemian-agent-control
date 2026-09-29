import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

export type { TerminalResourceRef } from '@bohemian/terminal-protocol';
export type TerminalResourceKind = TerminalResourceRef['kind'];

export interface TerminalLinkContext {
  cwd: string;
  terminalId?: string;
  agentKind?: string;
}

export interface TerminalResourceLinkMatch {
  startIndex: number;
  endIndex: number;
  resource: TerminalResourceRef;
  /** Plain clicks are otherwise left to normal terminal input and selection. */
  plainClick?: 'external';
}

/**
 * Resource plugins implement this data-only contract. They never receive xterm,
 * DOM, filesystem, inspector, or board editor objects.
 */
export interface TerminalLocalResourceStat {
  isDirectory: boolean;
  previewKind?: string;
  mimeType?: string;
}

export interface TerminalResourceLinkCapabilities {
  statLocalPath?: (
    path: string,
    cwd: string,
    signal: AbortSignal,
  ) => Promise<TerminalLocalResourceStat | null>;
}

export interface TerminalResourceLinkResolver {
  id: string;
  priority?: number;
  findLinks(lineText: string, context: TerminalLinkContext): readonly TerminalResourceLinkMatch[];
  validateLink?: (
    match: TerminalResourceLinkMatch,
    context: TerminalLinkContext,
    capabilities: TerminalResourceLinkCapabilities,
    signal: AbortSignal,
  ) => Promise<TerminalResourceRef | null>;
}
