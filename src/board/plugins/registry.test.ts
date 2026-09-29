import { describe, expect, it } from 'vitest';
import { List } from 'lucide-react';
import { listBoardPlugins, registerBoardPlugin, resetBoardPluginRegistryForTests } from './registry';
import type { BoardPlugin } from './types';

describe('registerBoardPlugin', () => {
  it('rejects duplicate ids and invalid contribution ids', () => {
    resetBoardPluginRegistryForTests();
    const plugin: BoardPlugin = {
      id: 'test-plugin',
      version: '1.0.0',
      titleKey: 'usage.title',
      toolbar: [{ id: 'open', icon: 'list', labelKey: 'usage.title' }],
    };
    registerBoardPlugin(plugin);
    expect(() => registerBoardPlugin(plugin)).toThrow('already registered');
    expect(listBoardPlugins()).toHaveLength(1);
    expect(() => registerBoardPlugin({ ...plugin, id: 'bad-plugin', toolbar: [{ ...plugin.toolbar![0], id: '' }] })).toThrow();
  });

  it('allows the same action id in toolbar and topbar', () => {
    resetBoardPluginRegistryForTests();
    registerBoardPlugin({
      id: 'token-usage',
      version: '1.0.0',
      titleKey: 'usage.title',
      toolbar: [{ id: 'open-usage', icon: 'list', labelKey: 'usage.title', panelId: 'overview' }],
      topbar: [{ id: 'open-usage', icon: List, labelKey: 'usage.title', panelId: 'overview' }],
      panels: [{ id: 'overview', titleKey: 'usage.title', Panel: () => null }],
    });
    expect(listBoardPlugins()).toHaveLength(1);
  });

  it('rejects a duplicate id inside one contribution slot', () => {
    resetBoardPluginRegistryForTests();
    expect(() => registerBoardPlugin({
      id: 'dup-toolbar',
      version: '1.0.0',
      titleKey: 'usage.title',
      toolbar: [
        { id: 'open', icon: 'list', labelKey: 'usage.title' },
        { id: 'open', icon: 'list', labelKey: 'usage.title' },
      ],
    })).toThrow('Duplicate toolbar id open');
  });

  it('rejects resource contribution id collisions across plugins', () => {
    resetBoardPluginRegistryForTests();
    registerBoardPlugin({
      id: 'files-a',
      version: '1.0.0',
      titleKey: 'files.a',
      resources: {
        terminalLinks: [{ id: 'local-path', findLinks: () => [] }],
      },
    });
    expect(() => registerBoardPlugin({
      id: 'files-b',
      version: '1.0.0',
      titleKey: 'files.b',
      resources: {
        terminalLinks: [{ id: 'local-path', findLinks: () => [] }],
      },
    })).toThrow('Duplicate terminal link id local-path across plugins files-a and files-b');
  });

  it('rejects resource importer id collisions across plugins', () => {
    resetBoardPluginRegistryForTests();
    const importer = {
      id: 'local-import',
      canImport: () => true,
      createResource: () => ({
        kind: 'local-file' as const,
        raw: 'file.txt',
        path: '/tmp/file.txt',
        displayText: 'file.txt',
        cwd: '/tmp',
        line: null,
        column: null,
      }),
    };
    registerBoardPlugin({
      id: 'import-a', version: '1.0.0', titleKey: 'import.a',
      resources: { resourceImporters: [importer] },
    });
    expect(() => registerBoardPlugin({
      id: 'import-b', version: '1.0.0', titleKey: 'import.b',
      resources: { resourceImporters: [importer] },
    })).toThrow('Duplicate resource importer id local-import across plugins import-a and import-b');
  });
});
