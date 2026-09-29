import type { InstalledUserPluginDto, UserPluginListResponse } from './contracts';

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return new Error(body?.error || fallback);
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw await responseError(response, `Request failed (${response.status})`);
  return response.json() as Promise<T>;
}

export function listUserPlugins(signal?: AbortSignal): Promise<UserPluginListResponse> {
  return requestJson<UserPluginListResponse>('/api/plugins', { signal });
}

export async function installUserPluginFromGitHub(url: string): Promise<InstalledUserPluginDto> {
  const response = await requestJson<{ success: true; plugin: InstalledUserPluginDto }>(
    '/api/plugins/install-github',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, trusted: true }),
    },
  );
  return response.plugin;
}

export async function setUserPluginEnabled(id: string, enabled: boolean): Promise<InstalledUserPluginDto> {
  const response = await requestJson<{ success: true; plugin: InstalledUserPluginDto }>(
    `/api/plugins/${encodeURIComponent(id)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    },
  );
  return response.plugin;
}

export async function removeUserPlugin(id: string): Promise<void> {
  await requestJson<{ success: true }>(`/api/plugins/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
