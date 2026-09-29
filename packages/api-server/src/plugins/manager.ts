import { HttpError } from '../http/errors';
import type { GitHubPluginSource as GitHubPluginSourceContract, InstalledUserPlugin, PluginFetch } from './contracts';
import { GitHubPluginSource } from './githubSource';
import { UserPluginStorage } from './storage';

export interface UserPluginManagerOptions {
  fetcher?: PluginFetch;
  githubToken?: string;
  storage?: UserPluginStorage;
  githubSource?: GitHubPluginSource;
}

function samePluginSource(a: GitHubPluginSourceContract, b: GitHubPluginSourceContract): boolean {
  return a.owner.toLowerCase() === b.owner.toLowerCase()
    && a.repository.toLowerCase() === b.repository.toLowerCase()
    && a.subdirectory === b.subdirectory;
}

export class UserPluginManager {
  readonly storage: UserPluginStorage;
  private readonly githubSource: GitHubPluginSource;

  constructor(root: string, options: UserPluginManagerOptions = {}) {
    this.storage = options.storage ?? new UserPluginStorage(root);
    this.githubSource = options.githubSource
      ?? new GitHubPluginSource(options.fetcher ?? globalThis.fetch, options.githubToken);
  }

  get root(): string {
    return this.storage.root;
  }

  list(): Promise<InstalledUserPlugin[]> {
    return this.storage.list();
  }

  async installFromGitHub(inputUrl: string): Promise<InstalledUserPlugin> {
    const downloaded = await this.githubSource.download(inputUrl);
    const existing = await this.storage.find(downloaded.manifest.id);
    if (existing && !samePluginSource(existing.source, downloaded.source)) {
      throw new HttpError(
        409,
        `Plugin id ${downloaded.manifest.id} is already installed from another GitHub repository; remove it first`,
        'plugin_id_conflict',
      );
    }
    const now = new Date().toISOString();
    const installed: InstalledUserPlugin = {
      id: downloaded.manifest.id,
      enabled: existing?.enabled ?? true,
      manifest: downloaded.manifest,
      source: downloaded.source,
      installedAt: existing?.installedAt ?? now,
      updatedAt: now,
      files: Object.fromEntries(downloaded.files.map((file) => [file.path, {
        size: file.content.byteLength,
        sha256: file.sha256,
        githubBlobSha: file.githubBlobSha,
      }])),
    };
    await this.storage.install(downloaded, installed);
    return installed;
  }

  setEnabled(id: string, enabled: boolean): Promise<InstalledUserPlugin> {
    return this.storage.setEnabled(id, enabled);
  }

  remove(id: string): Promise<void> {
    return this.storage.remove(id);
  }

  resolveFile(id: string, filePath: string): Promise<string> {
    return this.storage.resolveDeclaredFile(id, filePath);
  }
}
