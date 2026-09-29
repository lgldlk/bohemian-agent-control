import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseGitHubPluginUrl, UserPluginManager } from './index';

const roots: string[] = [];
const COMMIT = 'a'.repeat(40);
const BLOB_SHA = 'b'.repeat(40);

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function temporaryRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-plugin-test-'));
  roots.push(root);
  return root;
}

function githubFile(content: string, type = 'file') {
  const bytes = Buffer.from(content);
  return {
    type,
    encoding: 'base64',
    content: bytes.toString('base64'),
    size: bytes.byteLength,
    sha: BLOB_SHA,
  };
}

function pluginManifest(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    id: 'demo-plugin',
    name: { en: 'Demo plugin', 'zh-CN': '演示插件' },
    version: '1.0.0',
    entry: 'bundle.js',
    files: ['bundle.js'],
    permissions: [],
    ...overrides,
  };
}

function githubFetcher(manifest: Record<string, unknown>, bundle = 'export default { id: "demo-plugin", version: "1.0.0" };') {
  const files = new Map<string, ReturnType<typeof githubFile>>([
    ['examples/demo/plugin.json', githubFile(JSON.stringify(manifest))],
    ['examples/demo/bundle.js', githubFile(bundle)],
  ]);
  return async (input: string | URL | Request): Promise<Response> => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
    if (url.pathname.includes('/commits/')) return Response.json({ sha: COMMIT });
    const marker = '/contents/';
    const index = url.pathname.indexOf(marker);
    const filePath = index >= 0 ? decodeURIComponent(url.pathname.slice(index + marker.length)) : '';
    const file = files.get(filePath);
    return file ? Response.json(file) : Response.json({ message: 'not found' }, { status: 404 });
  };
}

describe('GitHub plugin URLs', () => {
  it('parses repository, tree and plugin.json URLs without accepting other hosts', () => {
    expect(parseGitHubPluginUrl('https://github.com/acme/plugins')).toMatchObject({
      owner: 'acme', repository: 'plugins', subdirectory: '',
    });
    expect(parseGitHubPluginUrl('https://github.com/acme/plugins/tree/main/examples/demo')).toMatchObject({
      ref: 'main', subdirectory: 'examples/demo',
    });
    expect(parseGitHubPluginUrl('https://github.com/acme/plugins/blob/main/examples/demo/plugin.json')).toMatchObject({
      ref: 'main', subdirectory: 'examples/demo',
    });
    expect(() => parseGitHubPluginUrl('https://example.com/acme/plugins')).toThrow('Only https://github.com');
  });
});

describe('user plugin storage', () => {
  it('installs a commit-pinned package, toggles it, serves declared files and removes it', async () => {
    const bundle = 'export default { id: "demo-plugin", version: "1.0.0" };';
    const integrity = `sha256-${createHash('sha256').update(bundle).digest('base64')}`;
    const root = temporaryRoot();
    const manager = new UserPluginManager(root, {
      fetcher: githubFetcher(pluginManifest({ integrity: { 'bundle.js': integrity } }), bundle) as typeof fetch,
    });

    const installed = await manager.installFromGitHub('https://github.com/acme/plugins/tree/main/examples/demo');
    expect(installed.source.commit).toBe(COMMIT);
    expect(installed.enabled).toBe(true);
    expect(fs.readFileSync(path.join(root, 'installed', 'demo-plugin', 'bundle.js'), 'utf8')).toBe(bundle);
    expect(await manager.resolveFile('demo-plugin', 'bundle.js')).toContain(path.join('demo-plugin', 'bundle.js'));

    expect((await manager.setEnabled('demo-plugin', false)).enabled).toBe(false);
    expect((await manager.list())[0]?.enabled).toBe(false);

    await manager.remove('demo-plugin');
    expect(await manager.list()).toEqual([]);
    expect(fs.existsSync(path.join(root, 'installed', 'demo-plugin'))).toBe(false);
  });

  it('rejects traversal, symlinks and integrity mismatches before installing', async () => {
    const traversal = new UserPluginManager(temporaryRoot(), {
      fetcher: githubFetcher(pluginManifest({ entry: '../bundle.js' })) as typeof fetch,
    });
    await expect(traversal.installFromGitHub('https://github.com/acme/plugins/tree/main/examples/demo'))
      .rejects.toMatchObject({ code: 'invalid_plugin_path' });

    const mismatch = new UserPluginManager(temporaryRoot(), {
      fetcher: githubFetcher(pluginManifest({
        integrity: { 'bundle.js': `sha256-${Buffer.alloc(32).toString('base64')}` },
      })) as typeof fetch,
    });
    await expect(mismatch.installFromGitHub('https://github.com/acme/plugins/tree/main/examples/demo'))
      .rejects.toMatchObject({ code: 'plugin_integrity_mismatch' });

    const manifest = pluginManifest();
    const symlinkFetcher = githubFetcher(manifest);
    const wrappedFetcher = async (input: string | URL | Request) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input.toString() : input.url);
      if (url.pathname.endsWith('/contents/examples/demo/bundle.js')) {
        return Response.json(githubFile('bundle target', 'symlink'));
      }
      return symlinkFetcher(input);
    };
    const symlink = new UserPluginManager(temporaryRoot(), { fetcher: wrappedFetcher as typeof fetch });
    await expect(symlink.installFromGitHub('https://github.com/acme/plugins/tree/main/examples/demo'))
      .rejects.toMatchObject({ code: 'invalid_plugin_file' });
  });

  it('does not let another repository replace an installed plugin id', async () => {
    const root = temporaryRoot();
    const manager = new UserPluginManager(root, { fetcher: githubFetcher(pluginManifest()) as typeof fetch });
    await manager.installFromGitHub('https://github.com/acme/plugins/tree/main/examples/demo');
    await expect(manager.installFromGitHub('https://github.com/other/plugins/tree/main/examples/demo'))
      .rejects.toMatchObject({ code: 'plugin_id_conflict' });
  });

  it('rebuilds a corrupt registry from per-plugin install metadata', async () => {
    const root = temporaryRoot();
    const manager = new UserPluginManager(root, { fetcher: githubFetcher(pluginManifest()) as typeof fetch });
    await manager.installFromGitHub('https://github.com/acme/plugins/tree/main/examples/demo');
    fs.writeFileSync(path.join(root, 'registry.json'), '{broken');
    expect((await manager.list()).map((plugin) => plugin.id)).toEqual(['demo-plugin']);
    expect(fs.readdirSync(root).some((name) => name.startsWith('registry.json.corrupt-'))).toBe(true);
  });
});
