export const USER_PLUGIN_REGISTRY_VERSION = 1;
export const USER_PLUGIN_MANIFEST_FILE = 'plugin.json';
export const USER_PLUGIN_INSTALL_FILE = 'install.json';
export const MAX_PLUGIN_MANIFEST_BYTES = 64 * 1024;
export const MAX_PLUGIN_FILE_BYTES = 1024 * 1024;
export const MAX_PLUGIN_TOTAL_BYTES = 4 * 1024 * 1024;
export const MAX_PLUGIN_FILES = 32;
export const USER_PLUGIN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export type LocalizedPluginText = string | Readonly<Record<string, string>>;

export interface UserPluginManifest {
  schemaVersion: 1;
  id: string;
  name: LocalizedPluginText;
  version: string;
  entry: string;
  files: readonly string[];
  description?: LocalizedPluginText;
  appVersion?: string;
  permissions: readonly string[];
  integrity: Readonly<Record<string, string>>;
}

export interface GitHubPluginSource {
  provider: 'github';
  owner: string;
  repository: string;
  ref?: string;
  subdirectory: string;
  commit: string;
  url: string;
}

export interface InstalledPluginFile {
  size: number;
  sha256: string;
  githubBlobSha: string;
}

export interface InstalledUserPlugin {
  id: string;
  enabled: boolean;
  manifest: UserPluginManifest;
  source: GitHubPluginSource;
  installedAt: string;
  updatedAt: string;
  files: Readonly<Record<string, InstalledPluginFile>>;
}

export interface UserPluginRegistry {
  schemaVersion: 1;
  plugins: InstalledUserPlugin[];
}

export interface GitHubPluginLocation {
  owner: string;
  repository: string;
  ref?: string;
  subdirectory: string;
  url: string;
}

export interface DownloadedPluginFile {
  path: string;
  content: Buffer;
  sha256: string;
  githubBlobSha: string;
}

export interface DownloadedPluginPackage {
  manifest: UserPluginManifest;
  source: GitHubPluginSource;
  files: DownloadedPluginFile[];
}

export type PluginFetch = typeof globalThis.fetch;
