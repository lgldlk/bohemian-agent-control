import { createResourceShape } from '@/board/resourceBoardOperations';
import { getBoardEditor } from '@/board/boardEditor';
import type { BoardResourceActionCapabilities } from '@/board/plugins/resourceTypes';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function getBoardResourceActionCapabilities(): BoardResourceActionCapabilities {
  return {
    copyText: (value) => navigator.clipboard.writeText(value),
    openExternal: (value) => {
      const url = safeExternalUrl(value);
      if (url) window.open(url, '_blank', 'noopener');
    },
    openLocalPath: async (path, cwd, action) => {
      const response = await fetch(`/api/fs/${action}?${new URLSearchParams({ path, cwd }).toString()}`, {
        method: 'POST',
      });
      if (!response.ok) throw new Error(`Unable to ${action} local resource`);
    },
    download: (resource: TerminalResourceRef) => {
      if (!resource.path) return;
      const query = new URLSearchParams({ path: resource.path, cwd: resource.cwd });
      window.open(`/api/fs/download?${query.toString()}`, '_blank', 'noopener');
    },
    pinToBoard: (resource) => {
      const editor = getBoardEditor();
      if (editor) createResourceShape(editor, resource);
    },
  };
}
