import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import type {
  BoardResourceActionContribution,
  BoardResourceImportFile,
  BoardResourceImporterContribution,
  BoardResourceProviderContribution,
  BoardResourceRendererContribution,
  BoardTerminalLinkContribution,
} from './resourceTypes';
import { listBoardPlugins, subscribeBoardPluginRegistry } from './registry';

function ordered<T extends { priority?: number; id: string }>(items: T[]): T[] {
  return items.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id.localeCompare(b.id));
}

function orderedActions(items: BoardResourceActionContribution[]): BoardResourceActionContribution[] {
  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}

let terminalLinks: readonly BoardTerminalLinkContribution[] | null = null;
let importers: readonly BoardResourceImporterContribution[] | null = null;
let providers: readonly BoardResourceProviderContribution[] | null = null;
let renderers: readonly BoardResourceRendererContribution[] | null = null;
let actions: readonly BoardResourceActionContribution[] | null = null;

subscribeBoardPluginRegistry(() => {
  terminalLinks = null;
  importers = null;
  providers = null;
  renderers = null;
  actions = null;
});

export function getBoardTerminalLinkResolvers(): readonly BoardTerminalLinkContribution[] {
  if (!terminalLinks) {
    terminalLinks = ordered(listBoardPlugins().flatMap((plugin) => [...(plugin.resources?.terminalLinks ?? [])]));
  }
  return terminalLinks;
}

export function getBoardResourceImporters(): readonly BoardResourceImporterContribution[] {
  if (!importers) {
    importers = ordered(listBoardPlugins().flatMap((plugin) => [...(plugin.resources?.resourceImporters ?? [])]));
  }
  return importers;
}

export function findBoardResourceImporter(file: BoardResourceImportFile): BoardResourceImporterContribution | null {
  for (const importer of getBoardResourceImporters()) {
    try {
      if (importer.canImport(file)) return importer;
    } catch (error) {
      console.error(`[board-resource-importer:${importer.id}] matcher failed`, error);
    }
  }
  return null;
}

export function getBoardResourceProviders(): readonly BoardResourceProviderContribution[] {
  if (!providers) {
    providers = ordered(listBoardPlugins().flatMap((plugin) => [...(plugin.resources?.resourceProviders ?? [])]));
  }
  return providers;
}

export function findBoardResourceProvider(resource: TerminalResourceRef): BoardResourceProviderContribution | null {
  for (const provider of getBoardResourceProviders()) {
    try {
      if (provider.canHandle(resource)) return provider;
    } catch (error) {
      console.error(`[board-resource-provider:${provider.id}] matcher failed`, error);
    }
  }
  return null;
}

export function getBoardResourceRenderers(): readonly BoardResourceRendererContribution[] {
  if (!renderers) {
    renderers = ordered(listBoardPlugins().flatMap((plugin) => [...(plugin.resources?.resourceRenderers ?? [])]));
  }
  return renderers;
}

export function findBoardResourceRenderer(
  document: Parameters<BoardResourceRendererContribution['canRender']>[0],
): BoardResourceRendererContribution | null {
  for (const renderer of getBoardResourceRenderers()) {
    try {
      if (renderer.canRender(document)) return renderer;
    } catch (error) {
      console.error(`[board-resource-renderer:${renderer.id}] matcher failed`, error);
    }
  }
  return null;
}

export function getBoardResourceActions(
  resource: TerminalResourceRef,
  document: Parameters<BoardResourceActionContribution['canRun']>[1],
): readonly BoardResourceActionContribution[] {
  if (!actions) {
    actions = orderedActions(listBoardPlugins().flatMap((plugin) => [...(plugin.resources?.resourceActions ?? [])]));
  }
  return actions.filter((action) => {
    try {
      return action.canRun(resource, document);
    } catch (error) {
      console.error(`[board-resource-action:${action.id}] matcher failed`, error);
      return false;
    }
  });
}
