import { randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { HttpError } from '../http/errors';
import {
  USER_PLUGIN_INSTALL_FILE,
  USER_PLUGIN_MANIFEST_FILE,
  USER_PLUGIN_REGISTRY_VERSION,
  type DownloadedPluginPackage,
  type InstalledUserPlugin,
  type UserPluginRegistry,
} from './contracts';
import {
  asRecord,
  decodeInstalledPlugin,
  normalizePluginRelativePath,
  validatePluginId,
} from './validation';

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function writeJsonAtomic(target: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const temporary = `${target}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.rename(temporary, target);
}

export class UserPluginStorage {
  readonly root: string;
  private readonly installedRoot: string;
  private readonly stagingRoot: string;
  private readonly registryPath: string;

  constructor(root: string) {
    this.root = path.resolve(root);
    this.installedRoot = path.join(this.root, 'installed');
    this.stagingRoot = path.join(this.root, 'staging');
    this.registryPath = path.join(this.root, 'registry.json');
  }

  async list(): Promise<InstalledUserPlugin[]> {
    const registry = await this.readRegistry();
    return [...registry.plugins].sort((a, b) => a.id.localeCompare(b.id));
  }

  async find(id: string): Promise<InstalledUserPlugin | undefined> {
    validatePluginId(id);
    return (await this.readRegistry()).plugins.find((plugin) => plugin.id === id);
  }

  async install(downloaded: DownloadedPluginPackage, installed: InstalledUserPlugin): Promise<void> {
    await this.ensureDirectories();
    const registry = await this.readRegistry();
    const stagingDir = await fs.mkdtemp(path.join(this.stagingRoot, '.install-'));
    try {
      await this.writePackage(stagingDir, downloaded, installed);
      await this.swapInstalledDirectory(stagingDir, installed.id, async () => {
        await this.writeRegistry({
          schemaVersion: 1,
          plugins: [...registry.plugins.filter((plugin) => plugin.id !== installed.id), installed],
        });
      });
    } finally {
      await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  async setEnabled(id: string, enabled: boolean): Promise<InstalledUserPlugin> {
    validatePluginId(id);
    const registry = await this.readRegistry();
    const current = registry.plugins.find((plugin) => plugin.id === id);
    if (!current) throw new HttpError(404, 'Plugin is not installed', 'plugin_not_found');
    const updated = { ...current, enabled, updatedAt: new Date().toISOString() };
    await writeJsonAtomic(path.join(this.pluginDirectory(id), USER_PLUGIN_INSTALL_FILE), updated);
    await this.writeRegistry({
      schemaVersion: 1,
      plugins: registry.plugins.map((plugin) => plugin.id === id ? updated : plugin),
    });
    return updated;
  }

  async remove(id: string): Promise<void> {
    validatePluginId(id);
    const registry = await this.readRegistry();
    if (!registry.plugins.some((plugin) => plugin.id === id)) {
      throw new HttpError(404, 'Plugin is not installed', 'plugin_not_found');
    }
    const finalDir = this.pluginDirectory(id);
    const trashDir = path.join(this.stagingRoot, `.remove-${id}-${randomUUID()}`);
    if (await pathExists(finalDir)) await fs.rename(finalDir, trashDir);
    try {
      await this.writeRegistry({
        schemaVersion: 1,
        plugins: registry.plugins.filter((plugin) => plugin.id !== id),
      });
    } catch (error) {
      if (await pathExists(trashDir)) await fs.rename(trashDir, finalDir).catch(() => undefined);
      throw error;
    }
    await fs.rm(trashDir, { recursive: true, force: true });
  }

  async resolveDeclaredFile(id: string, rawFilePath: string): Promise<string> {
    validatePluginId(id);
    const filePath = normalizePluginRelativePath(rawFilePath);
    const plugin = await this.find(id);
    if (!plugin || !plugin.manifest.files.includes(filePath)) {
      throw new HttpError(404, 'Plugin file was not found', 'plugin_file_not_found');
    }
    const pluginRoot = await fs.realpath(this.pluginDirectory(id)).catch(() => '');
    const target = await fs.realpath(path.join(this.pluginDirectory(id), ...filePath.split('/'))).catch(() => '');
    if (!pluginRoot || !target || (target !== pluginRoot && !target.startsWith(`${pluginRoot}${path.sep}`))) {
      throw new HttpError(404, 'Plugin file was not found', 'plugin_file_not_found');
    }
    const stat = await fs.stat(target).catch(() => null);
    if (!stat?.isFile()) throw new HttpError(404, 'Plugin file was not found', 'plugin_file_not_found');
    return target;
  }

  private pluginDirectory(id: string): string {
    return path.join(this.installedRoot, validatePluginId(id));
  }

  private async ensureDirectories(): Promise<void> {
    await Promise.all([
      fs.mkdir(this.installedRoot, { recursive: true, mode: 0o700 }),
      fs.mkdir(this.stagingRoot, { recursive: true, mode: 0o700 }),
    ]);
  }

  private async readRegistry(): Promise<UserPluginRegistry> {
    await this.ensureDirectories();
    try {
      const raw = JSON.parse(await fs.readFile(this.registryPath, 'utf8')) as unknown;
      const record = asRecord(raw);
      if (record?.schemaVersion !== USER_PLUGIN_REGISTRY_VERSION || !Array.isArray(record.plugins)) {
        throw new Error('invalid registry');
      }
      const plugins = record.plugins.map(decodeInstalledPlugin);
      if (plugins.some((plugin) => !plugin)) throw new Error('invalid plugin entry');
      return { schemaVersion: 1, plugins: plugins as InstalledUserPlugin[] };
    } catch {
      if (await pathExists(this.registryPath)) {
        await fs.rename(this.registryPath, `${this.registryPath}.corrupt-${Date.now()}`).catch(() => undefined);
      }
      return this.rebuildRegistry();
    }
  }

  private async rebuildRegistry(): Promise<UserPluginRegistry> {
    await this.ensureDirectories();
    const plugins: InstalledUserPlugin[] = [];
    for (const entry of await fs.readdir(this.installedRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      try {
        validatePluginId(entry.name);
        const raw = JSON.parse(await fs.readFile(path.join(this.installedRoot, entry.name, USER_PLUGIN_INSTALL_FILE), 'utf8'));
        const plugin = decodeInstalledPlugin(raw);
        if (plugin) plugins.push(plugin);
      } catch {
        // Ignore incomplete or manually damaged plugin directories.
      }
    }
    const registry: UserPluginRegistry = { schemaVersion: 1, plugins };
    await this.writeRegistry(registry);
    return registry;
  }

  private writeRegistry(registry: UserPluginRegistry): Promise<void> {
    return writeJsonAtomic(this.registryPath, registry);
  }

  private async writePackage(
    stagingDir: string,
    downloaded: DownloadedPluginPackage,
    installed: InstalledUserPlugin,
  ): Promise<void> {
    for (const file of downloaded.files) {
      const target = path.join(stagingDir, ...file.path.split('/'));
      await fs.mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await fs.writeFile(target, file.content, { mode: 0o600, flag: 'wx' });
    }
    await fs.writeFile(
      path.join(stagingDir, USER_PLUGIN_MANIFEST_FILE),
      `${JSON.stringify(downloaded.manifest, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    );
    await fs.writeFile(
      path.join(stagingDir, USER_PLUGIN_INSTALL_FILE),
      `${JSON.stringify(installed, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' },
    );
  }

  private async swapInstalledDirectory(
    stagingDir: string,
    pluginId: string,
    commitRegistry: () => Promise<void>,
  ): Promise<void> {
    const finalDir = this.pluginDirectory(pluginId);
    const backupDir = path.join(this.stagingRoot, `.backup-${pluginId}-${randomUUID()}`);
    const hadExistingDirectory = await pathExists(finalDir);
    if (hadExistingDirectory) await fs.rename(finalDir, backupDir);
    try {
      await fs.rename(stagingDir, finalDir);
      await commitRegistry();
    } catch (error) {
      await fs.rm(finalDir, { recursive: true, force: true }).catch(() => undefined);
      if (hadExistingDirectory) await fs.rename(backupDir, finalDir).catch(() => undefined);
      throw error;
    }
    if (hadExistingDirectory) await fs.rm(backupDir, { recursive: true, force: true });
  }
}
