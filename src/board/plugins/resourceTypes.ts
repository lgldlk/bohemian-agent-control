import type { ComponentType } from 'react';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

export interface BoardTerminalLinkContext {
  cwd: string;
  terminalId?: string;
  agentKind?: string;
}

export interface BoardTerminalLinkMatch {
  startIndex: number;
  endIndex: number;
  resource: TerminalResourceRef;
  plainClick?: 'external';
}

export interface BoardTerminalLinkCapabilities {
  statLocalPath?: (
    path: string,
    cwd: string,
    signal: AbortSignal,
  ) => Promise<{ isDirectory: boolean; previewKind?: string; mimeType?: string } | null>;
}

export interface BoardTerminalLinkContribution {
  id: string;
  priority?: number;
  findLinks(
    lineText: string,
    context: BoardTerminalLinkContext,
  ): readonly BoardTerminalLinkMatch[];
  validateLink?: (
    match: BoardTerminalLinkMatch,
    context: BoardTerminalLinkContext,
    capabilities: BoardTerminalLinkCapabilities,
    signal: AbortSignal,
  ) => Promise<TerminalResourceRef | null>;
}

export interface BoardResourceDocument {
  resource: TerminalResourceRef;
  previewKind: string;
  name: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  text?: string;
  message?: string;
}

/** Host-owned API bridge. Contributions never receive fetch, filesystem or editor access. */
export interface BoardResourceProviderCapabilities {
  inspectLocalPath(
    path: string,
    cwd: string,
    signal: AbortSignal,
  ): Promise<{
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
    mimeType?: string;
    previewKind: string;
    text?: string;
  }>;
}

export interface BoardResourceImportFile {
  name: string;
  size: number;
  mimeType: string;
  lastModified: number;
}

export interface BoardImportedResource {
  name: string;
  path: string;
  cwd: string;
  size: number;
  mimeType?: string;
  previewKind: string;
}

export interface BoardResourceImporterContribution {
  id: string;
  priority?: number;
  canImport(file: BoardResourceImportFile): boolean;
  createResource(imported: BoardImportedResource): TerminalResourceRef;
}

export interface BoardResourceProviderContribution {
  id: string;
  priority?: number;
  canHandle(resource: TerminalResourceRef): boolean;
  load(
    resource: TerminalResourceRef,
    capabilities: BoardResourceProviderCapabilities,
    signal: AbortSignal,
  ): Promise<BoardResourceDocument>;
}

export interface BoardResourceRendererProps {
  document: BoardResourceDocument;
  previewUrl?: string;
  surface: 'board' | 'inspector';
}

export interface BoardResourceRendererContribution {
  id: string;
  priority?: number;
  canRender(document: BoardResourceDocument): boolean;
  Component: ComponentType<BoardResourceRendererProps>;
}

export interface BoardResourceActionCapabilities {
  copyText(value: string): Promise<void>;
  openExternal(url: string): void;
  openLocalPath(path: string, cwd: string, action: 'open' | 'reveal'): Promise<void>;
  download(resource: TerminalResourceRef): void;
  pinToBoard(resource: TerminalResourceRef): void;
}

export interface BoardResourceActionContribution {
  id: string;
  labelKey: string;
  icon: ComponentType<{ size?: number }>;
  order?: number;
  canRun(resource: TerminalResourceRef, document: BoardResourceDocument): boolean;
  run(
    resource: TerminalResourceRef,
    document: BoardResourceDocument,
    capabilities: BoardResourceActionCapabilities,
  ): void | Promise<void>;
}

export interface BoardResourceContributions {
  terminalLinks?: readonly BoardTerminalLinkContribution[];
  resourceImporters?: readonly BoardResourceImporterContribution[];
  resourceProviders?: readonly BoardResourceProviderContribution[];
  resourceRenderers?: readonly BoardResourceRendererContribution[];
  resourceActions?: readonly BoardResourceActionContribution[];
}
