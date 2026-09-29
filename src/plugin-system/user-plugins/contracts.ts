export type LocalizedUserPluginText = string | Readonly<Record<string, string>>;

export interface InstalledUserPluginDto {
  id: string;
  enabled: boolean;
  manifest: {
    schemaVersion: 1;
    id: string;
    name: LocalizedUserPluginText;
    version: string;
    entry: string;
    files: readonly string[];
    description?: LocalizedUserPluginText;
    appVersion?: string;
    permissions: readonly string[];
  };
  source: {
    provider: 'github';
    owner: string;
    repository: string;
    ref?: string;
    subdirectory: string;
    commit: string;
    url: string;
  };
  installedAt: string;
  updatedAt: string;
  entryUrl: string;
}

export interface UserPluginListResponse {
  success: true;
  storageRoot: string;
  plugins: InstalledUserPluginDto[];
}

export function localizedUserPluginText(
  value: LocalizedUserPluginText | undefined,
  language: string,
  fallback: string,
): string {
  if (typeof value === 'string') return value;
  if (!value) return fallback;
  const exact = value[language];
  if (exact) return exact;
  const base = value[language.split('-')[0]];
  return base ?? value.en ?? value['zh-CN'] ?? Object.values(value)[0] ?? fallback;
}
