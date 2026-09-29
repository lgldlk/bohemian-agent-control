import type { BoardPlugin, BoardPluginContentContribution } from './types';

const plugins = new Map<string, BoardPlugin>();

export type BoardPluginRegistryEvent =
  | { type: 'registered'; plugin: BoardPlugin }
  | { type: 'unregistered'; pluginId: string };

export type BoardPluginRegistryListener = (event: BoardPluginRegistryEvent) => void;
const registryListeners = new Set<BoardPluginRegistryListener>();

function emitRegistryEvent(event: BoardPluginRegistryEvent): void {
  for (const listener of [...registryListeners]) listener(event);
}

export function subscribeBoardPluginRegistry(listener: BoardPluginRegistryListener): () => void {
  registryListeners.add(listener);
  return () => registryListeners.delete(listener);
}

function assertUniqueIds(
  plugin: BoardPlugin,
  kind: string,
  items: readonly { id: string }[] | undefined,
): void {
  const ids = new Set<string>();
  for (const item of items ?? []) {
    if (!item.id.trim()) throw new Error(`${kind} id cannot be empty in plugin ${plugin.id}`);
    if (ids.has(item.id)) throw new Error(`Duplicate ${kind} id ${item.id} in plugin ${plugin.id}`);
    ids.add(item.id);
  }
}

function assertContributionIds(plugin: BoardPlugin): void {
  // 同一动作可以同时出现在 toolbar 和 topbar，id 只在各自槽位内唯一。
  assertUniqueIds(plugin, 'toolbar', plugin.toolbar);
  assertUniqueIds(plugin, 'topbar', plugin.topbar);
  assertUniqueIds(plugin, 'panel', plugin.panels);
  assertUniqueIds(plugin, 'settings', plugin.settings);
  assertUniqueIds(plugin, 'page', plugin.pages);
  assertUniqueIds(plugin, 'overlay', plugin.overlays);
  assertUniqueIds(plugin, 'command', plugin.commands);
  assertUniqueIds(plugin, 'terminal overlay', plugin.terminalOverlays);
  assertUniqueIds(plugin, 'terminal link', plugin.resources?.terminalLinks);
  assertUniqueIds(plugin, 'resource importer', plugin.resources?.resourceImporters);
  assertUniqueIds(plugin, 'resource provider', plugin.resources?.resourceProviders);
  assertUniqueIds(plugin, 'resource renderer', plugin.resources?.resourceRenderers);
  assertUniqueIds(plugin, 'resource action', plugin.resources?.resourceActions);
  const contentTypes = new Set<string>();
  plugin.content?.forEach((item) => {
    if (!item.componentType.trim() || contentTypes.has(item.componentType)) {
      throw new Error(`Duplicate or empty content type ${item.componentType} in plugin ${plugin.id}`);
    }
    contentTypes.add(item.componentType);
  });
}

function assertGlobalResourceContributionIds(plugin: BoardPlugin): void {
  const slots = [
    ['terminal link', plugin.resources?.terminalLinks, (item: BoardPlugin) => item.resources?.terminalLinks],
    ['resource importer', plugin.resources?.resourceImporters, (item: BoardPlugin) => item.resources?.resourceImporters],
    ['resource provider', plugin.resources?.resourceProviders, (item: BoardPlugin) => item.resources?.resourceProviders],
    ['resource renderer', plugin.resources?.resourceRenderers, (item: BoardPlugin) => item.resources?.resourceRenderers],
    ['resource action', plugin.resources?.resourceActions, (item: BoardPlugin) => item.resources?.resourceActions],
  ] as const;
  for (const [kind, incoming, select] of slots) {
    for (const contribution of incoming ?? []) {
      for (const registered of plugins.values()) {
        if (select(registered)?.some((item) => item.id === contribution.id)) {
          throw new Error(`Duplicate ${kind} id ${contribution.id} across plugins ${registered.id} and ${plugin.id}`);
        }
      }
    }
  }
}

export function registerBoardPlugin(plugin: BoardPlugin): void {
  if (!plugin.id.trim()) throw new Error('Board plugin id cannot be empty');
  if (!plugin.version.trim()) throw new Error(`Board plugin ${plugin.id} must declare a version`);
  assertContributionIds(plugin);
  if (plugins.has(plugin.id)) throw new Error(`Board plugin ${plugin.id} is already registered`);
  assertGlobalResourceContributionIds(plugin);
  plugins.set(plugin.id, plugin);
  emitRegistryEvent({ type: 'registered', plugin });
}

export function unregisterBoardPlugin(id: string): boolean {
  const removed = plugins.delete(id);
  if (removed) emitRegistryEvent({ type: 'unregistered', pluginId: id });
  return removed;
}

export function listBoardPlugins(): readonly BoardPlugin[] {
  return [...plugins.values()];
}

export function findBoardPlugin(id: string): BoardPlugin | undefined {
  return plugins.get(id);
}

export function findBoardPluginContent(pluginId: string, componentType: string): BoardPluginContentContribution | undefined {
  return findBoardPlugin(pluginId)?.content?.find((content) => content.componentType === componentType);
}

export function resetBoardPluginRegistryForTests(): void {
  for (const id of [...plugins.keys()]) unregisterBoardPlugin(id);
}
