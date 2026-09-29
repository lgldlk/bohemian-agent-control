import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBoardPlugin, resetBoardPluginRegistryForTests } from './registry';
import {
  findBoardResourceImporter,
  findBoardResourceProvider,
  getBoardResourceActions,
  getBoardTerminalLinkResolvers,
} from './resourceRuntime';

const resource = {
  kind: 'remote-url' as const,
  raw: 'example.com',
  url: 'https://example.com/',
  displayText: 'example.com',
  cwd: '/repo',
  line: null,
  column: null,
};

const document = { resource, previewKind: 'link', name: 'example.com' };

afterEach(() => resetBoardPluginRegistryForTests());

describe('board resource contribution runtime', () => {
  it('orders terminal resolvers by priority and invalidates cache on registry changes', () => {
    registerBoardPlugin({
      id: 'low', version: '1.0.0', titleKey: 'low',
      resources: { terminalLinks: [{ id: 'low-link', priority: 1, findLinks: () => [] }] },
    });
    expect(getBoardTerminalLinkResolvers().map((item) => item.id)).toEqual(['low-link']);

    registerBoardPlugin({
      id: 'high', version: '1.0.0', titleKey: 'high',
      resources: { terminalLinks: [{ id: 'high-link', priority: 10, findLinks: () => [] }] },
    });
    expect(getBoardTerminalLinkResolvers().map((item) => item.id)).toEqual(['high-link', 'low-link']);
  });

  it('selects the highest-priority resource importer', () => {
    registerBoardPlugin({
      id: 'importers', version: '1.0.0', titleKey: 'importers',
      resources: {
        resourceImporters: [
          { id: 'fallback-importer', priority: 1, canImport: () => true, createResource: () => resource },
          { id: 'image-importer', priority: 10, canImport: (file) => file.mimeType.startsWith('image/'), createResource: () => resource },
        ],
      },
    });
    expect(findBoardResourceImporter({ name: 'preview.png', size: 10, mimeType: 'image/png', lastModified: 0 })?.id)
      .toBe('image-importer');
    expect(findBoardResourceImporter({ name: 'notes.txt', size: 10, mimeType: 'text/plain', lastModified: 0 })?.id)
      .toBe('fallback-importer');
  });

  it('isolates provider matcher failures', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    registerBoardPlugin({
      id: 'providers', version: '1.0.0', titleKey: 'providers',
      resources: {
        resourceProviders: [
          { id: 'bad-provider', priority: 10, canHandle: () => { throw new Error('bad matcher'); }, load: async () => document },
          { id: 'good-provider', priority: 1, canHandle: () => true, load: async () => document },
        ],
      },
    });
    expect(findBoardResourceProvider(resource)?.id).toBe('good-provider');
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it('orders actions by declared order', () => {
    const action = (id: string, order: number) => ({
      id,
      order,
      labelKey: id,
      icon: () => null,
      canRun: () => true,
      run: () => undefined,
    });
    registerBoardPlugin({
      id: 'actions', version: '1.0.0', titleKey: 'actions',
      resources: { resourceActions: [action('third', 30), action('first', 10), action('second', 20)] },
    });
    expect(getBoardResourceActions(resource, document).map((item) => item.id))
      .toEqual(['first', 'second', 'third']);
  });
});
