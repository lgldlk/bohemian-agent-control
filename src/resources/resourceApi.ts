import type { BoardImportedResource, BoardResourceProviderCapabilities } from '@/board/plugins/resourceTypes';
import type { TerminalResourceLinkCapabilities } from '@bohemian/terminal-ui';

function requestError(response: Response, fallback: string): Promise<Error> {
  return response.json().catch(() => null).then((body) => new Error(body?.error ?? fallback));
}

async function inspectLocalPath(path: string, cwd: string, signal: AbortSignal) {
  const query = new URLSearchParams({ path, cwd });
  const statResponse = await fetch(`/api/fs/stat?${query.toString()}`, { signal });
  if (!statResponse.ok) throw await requestError(statResponse, 'Unable to inspect file');
  const stat = await statResponse.json() as {
    name: string;
    path: string;
    size: number;
    modifiedAt: string;
    mimeType?: string;
    previewKind: string;
    isDirectory?: boolean;
  };
  if (stat.previewKind !== 'text' || stat.isDirectory) return stat;
  const contentResponse = await fetch(`/api/fs/read?${query.toString()}`, { signal });
  if (!contentResponse.ok) throw await requestError(contentResponse, 'Unable to read file');
  return { ...stat, text: await contentResponse.text() };
}

export async function uploadDroppedResourceFile(
  file: File,
  signal?: AbortSignal,
): Promise<BoardImportedResource> {
  const query = new URLSearchParams({
    name: file.name,
    mimeType: file.type,
  });
  const response = await fetch(`/api/fs/import?${query.toString()}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
    signal,
  });
  if (!response.ok) throw await requestError(response, 'Unable to import dropped file');
  return response.json() as Promise<BoardImportedResource>;
}

export const boardResourceProviderCapabilities: BoardResourceProviderCapabilities = {
  inspectLocalPath,
};

export const terminalResourceLinkCapabilities: TerminalResourceLinkCapabilities = {
  async statLocalPath(path, cwd, signal) {
    const query = new URLSearchParams({ path, cwd });
    const response = await fetch(`/api/fs/stat?${query.toString()}`, { signal });
    if (!response.ok) return null;
    const stat = await response.json() as { isDirectory?: boolean; previewKind?: string; mimeType?: string };
    return {
      isDirectory: stat.isDirectory === true,
      previewKind: stat.previewKind,
      mimeType: stat.mimeType,
    };
  },
};
