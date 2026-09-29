import { HttpError } from '../http/errors';
import {
  MAX_PLUGIN_FILES,
  USER_PLUGIN_ID_PATTERN,
  USER_PLUGIN_INSTALL_FILE,
  USER_PLUGIN_MANIFEST_FILE,
  type InstalledUserPlugin,
  type LocalizedPluginText,
  type UserPluginManifest,
} from './contracts';

const PLUGIN_VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+_-]{0,63}$/;
const GITHUB_NAME_PATTERN = /^[A-Za-z0-9_.-]{1,100}$/;

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function requireShortString(value: unknown, label: string, maxLength = 160): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
    throw new HttpError(400, `${label} is invalid`, 'invalid_plugin_manifest');
  }
  return value.trim();
}

export function validateGitHubName(value: string, label: string): string {
  if (!GITHUB_NAME_PATTERN.test(value)) {
    throw new HttpError(400, `${label} is invalid`, 'invalid_github_url');
  }
  return value;
}

export function validatePluginId(id: string): string {
  if (!USER_PLUGIN_ID_PATTERN.test(id)) {
    throw new HttpError(400, 'Invalid plugin id', 'invalid_plugin_id');
  }
  return id;
}

export function normalizePluginRelativePath(value: unknown, label = 'plugin file'): string {
  const raw = requireShortString(value, label, 240);
  if (raw.includes('\\') || raw.includes('\0') || raw.startsWith('/') || /^[A-Za-z]:/.test(raw)) {
    throw new HttpError(400, `${label} must be a relative POSIX path`, 'invalid_plugin_path');
  }
  const parts = raw.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new HttpError(400, `${label} escapes the plugin directory`, 'invalid_plugin_path');
  }
  return parts.join('/');
}

function decodeLocalizedText(value: unknown, label: string): LocalizedPluginText {
  if (typeof value === 'string') return requireShortString(value, label, 160);
  const record = asRecord(value);
  if (!record) throw new HttpError(400, `${label} is invalid`, 'invalid_plugin_manifest');
  const entries = Object.entries(record);
  if (!entries.length || entries.length > 8) {
    throw new HttpError(400, `${label} is invalid`, 'invalid_plugin_manifest');
  }
  return Object.fromEntries(entries.map(([language, text]) => [
    requireShortString(language, `${label} language`, 24),
    requireShortString(text, `${label} text`, 160),
  ]));
}

function decodeStringArray(value: unknown, label: string, maxItems: number): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new HttpError(400, `${label} is invalid`, 'invalid_plugin_manifest');
  }
  return value.map((item) => requireShortString(item, label, 120));
}

export function decodeUserPluginManifest(value: unknown): UserPluginManifest {
  const record = asRecord(value);
  if (!record || record.schemaVersion !== 1) {
    throw new HttpError(400, 'plugin.json must use schemaVersion 1', 'invalid_plugin_manifest');
  }
  const id = requireShortString(record.id, 'plugin id', 64);
  if (!USER_PLUGIN_ID_PATTERN.test(id)) {
    throw new HttpError(400, 'plugin id must use lowercase letters, numbers, dots, underscores or dashes', 'invalid_plugin_manifest');
  }
  const version = requireShortString(record.version, 'plugin version', 64);
  if (!PLUGIN_VERSION_PATTERN.test(version)) {
    throw new HttpError(400, 'plugin version is invalid', 'invalid_plugin_manifest');
  }
  const entry = normalizePluginRelativePath(record.entry, 'plugin entry');
  if (!/\.(?:m?js)$/i.test(entry)) {
    throw new HttpError(400, 'plugin entry must be a browser ESM .js or .mjs file', 'invalid_plugin_manifest');
  }
  const declaredFiles = decodeStringArray(record.files, 'plugin files', MAX_PLUGIN_FILES)
    .map((file) => normalizePluginRelativePath(file));
  const files = [...new Set([entry, ...declaredFiles])];
  if (
    files.length > MAX_PLUGIN_FILES
    || files.includes(USER_PLUGIN_MANIFEST_FILE)
    || files.includes(USER_PLUGIN_INSTALL_FILE)
  ) {
    throw new HttpError(400, 'plugin files are invalid', 'invalid_plugin_manifest');
  }
  const permissions = [...new Set(decodeStringArray(record.permissions, 'plugin permissions', 32))];
  const integrityRecord = asRecord(record.integrity) ?? {};
  const integrity: Record<string, string> = {};
  for (const [rawFile, rawDigest] of Object.entries(integrityRecord)) {
    const file = normalizePluginRelativePath(rawFile, 'integrity file');
    if (!files.includes(file) || typeof rawDigest !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/.test(rawDigest)) {
      throw new HttpError(400, 'plugin integrity map is invalid', 'invalid_plugin_manifest');
    }
    integrity[file] = rawDigest;
  }
  return {
    schemaVersion: 1,
    id,
    name: decodeLocalizedText(record.name, 'plugin name'),
    version,
    entry,
    files,
    ...(record.description !== undefined ? { description: decodeLocalizedText(record.description, 'plugin description') } : {}),
    ...(record.appVersion !== undefined ? { appVersion: requireShortString(record.appVersion, 'app version', 80) } : {}),
    permissions,
    integrity,
  };
}

export function decodeInstalledPlugin(value: unknown): InstalledUserPlugin | null {
  const record = asRecord(value);
  const source = asRecord(record?.source);
  const files = asRecord(record?.files);
  if (!record || !source || !files || typeof record.enabled !== 'boolean') return null;
  try {
    const manifest = decodeUserPluginManifest(record.manifest);
    if (record.id !== manifest.id || source.provider !== 'github') return null;
    const owner = validateGitHubName(String(source.owner ?? ''), 'GitHub owner');
    const repository = validateGitHubName(String(source.repository ?? ''), 'GitHub repository');
    const commit = typeof source.commit === 'string' && /^[0-9a-f]{40}$/i.test(source.commit) ? source.commit : '';
    if (!commit || typeof source.url !== 'string' || typeof source.subdirectory !== 'string') return null;
    return {
      id: manifest.id,
      enabled: record.enabled,
      manifest,
      source: {
        provider: 'github',
        owner,
        repository,
        ...(typeof source.ref === 'string' && source.ref ? { ref: source.ref } : {}),
        subdirectory: source.subdirectory,
        commit,
        url: source.url,
      },
      installedAt: typeof record.installedAt === 'string' ? record.installedAt : new Date(0).toISOString(),
      updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : new Date(0).toISOString(),
      files: files as InstalledUserPlugin['files'],
    };
  } catch {
    return null;
  }
}
