import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import {
  findBoardResourceRenderer,
  getBoardResourceActions,
} from '@/board/plugins/resourceRuntime';
import { BoardPluginErrorBoundary } from '@/board/plugins/BoardPluginErrorBoundary';
import { getBoardResourceActionCapabilities } from './resourceActions';
import { resourcePreviewUrl, useResourceDocument } from './useResourceDocument';

export function ResourceInspector({ resource, onClose }: { resource: TerminalResourceRef; onClose: () => void }) {
  const { t } = useTranslation();
  const state = useResourceDocument(resource);
  const document = state.status === 'ready' ? state.document : undefined;
  const renderer = document ? findBoardResourceRenderer(document) : null;
  const Renderer = renderer?.Component;
  const actions = useMemo(
    () => document ? getBoardResourceActions(document.resource, document) : [],
    [document],
  );
  const displayedResource = document?.resource ?? resource;
  const location = displayedResource.path
    ?? displayedResource.persistentUrl
    ?? displayedResource.url
    ?? displayedResource.raw;
  const title = displayedResource.kind === 'remote-url'
    ? (() => {
        try { return new URL(displayedResource.persistentUrl ?? displayedResource.url ?? '').hostname; }
        catch { return 'External link'; }
      })()
    : displayedResource.displayText;
  const previewUrl = resourcePreviewUrl(displayedResource);
  const capabilities = getBoardResourceActionCapabilities();

  const runAction = (action: (typeof actions)[number]): void => {
    if (!document) return;
    try {
      void Promise.resolve(action.run(document.resource, document, capabilities)).catch((error: unknown) => {
        console.error(`[board-resource-action:${action.id}] failed`, error);
      });
    } catch (error) {
      console.error(`[board-resource-action:${action.id}] failed`, error);
    }
  };

  return (
    <div className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/70 p-4" onMouseDown={onClose}>
      <section className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden border border-zinc-700 bg-zinc-950 shadow-2xl" onMouseDown={(event) => event.stopPropagation()}>
        <header className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-zinc-100">{title}</div>
            <div className="truncate font-mono text-[11px] text-zinc-500" title={location}>{location}</div>
          </div>
          {actions.map((action) => {
            const Icon = action.icon;
            const label = t(action.labelKey);
            return (
              <button
                key={action.id}
                type="button"
                title={label}
                aria-label={label}
                className="flex h-8 w-8 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white"
                onClick={() => runAction(action)}
              >
                <Icon size={15} />
              </button>
            );
          })}
          <button type="button" title="Close preview" aria-label="Close preview" className="flex h-8 w-8 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white" onClick={onClose}><X size={16} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {state.status === 'loading' && <div className="p-8 text-center text-sm text-zinc-500">Loading resource...</div>}
          {state.status === 'error' && <div className="p-8 text-center text-sm text-red-300">{state.error}</div>}
          {state.status === 'ready' && document && Renderer && (
            <BoardPluginErrorBoundary pluginId={`resource-renderer:${renderer?.id ?? 'unknown'}`}>
              <Renderer document={document} previewUrl={previewUrl} surface="inspector" />
            </BoardPluginErrorBoundary>
          )}
          {state.status === 'ready' && document && !Renderer && <div className="p-8 text-center text-sm text-zinc-400">No renderer is available for this resource.</div>}
        </div>
      </section>
    </div>
  );
}
