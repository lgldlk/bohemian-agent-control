import { ExternalLink, Pin, Copy } from 'lucide-react';
import type { BoardPlugin, BoardTerminalLinkContribution } from '@/plugin-system';
import { extractTerminalWebLinks, isSafeHttpUrl } from './parser';

export const webUrlTerminalLinkResolver: BoardTerminalLinkContribution = {
  id: 'web-url',
  priority: 30,
  findLinks: extractTerminalWebLinks,
};

export const webUrlPlugin: BoardPlugin = {
  id: 'web-url-resource',
  version: '1.0.0',
  titleKey: 'resource.webUrl',
  translations: {
    'zh-CN': { resource: { webUrl: '网页链接', openExternal: '在浏览器中打开', copyUrl: '复制网址', pin: '固定到画板' } },
    en: { resource: { webUrl: 'Web link', openExternal: 'Open in browser', copyUrl: 'Copy URL', pin: 'Pin to board' } },
  },
  resources: {
    terminalLinks: [webUrlTerminalLinkResolver],
    resourceProviders: [{
      id: 'web-url-provider',
      priority: 30,
      canHandle: (resource) => resource.kind === 'remote-url',
      async load(resource, _capabilities, signal) {
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
        const url = resource.persistentUrl ?? resource.url;
        if (!url || !isSafeHttpUrl(url)) throw new Error('URL is not safe to preview');
        return {
          resource: { ...resource, persistentUrl: url },
          previewKind: 'link',
          name: new URL(url).hostname,
          message: 'Remote page fetching and embedding are disabled.',
        };
      },
    }],
    resourceRenderers: [{
      id: 'web-url-link-card',
      priority: 20,
      canRender: (document) => document.resource.kind === 'remote-url',
      Component: ({ document, surface }) => {
        const url = document.resource.url ?? document.resource.persistentUrl;
        return (
          <div className={`flex h-full min-h-0 flex-col bg-zinc-900 ${surface === 'inspector' ? 'mx-auto min-h-[70vh] w-full max-w-5xl rounded border border-zinc-700' : ''}`}>
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-700 px-3 py-2">
              <div className="min-w-0 flex-1 truncate font-mono text-[10px] text-zinc-300" title={url}>{url}</div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex shrink-0 items-center gap-1 border border-zinc-600 px-2 py-1 text-[10px] text-sky-300 hover:border-sky-500 hover:text-sky-200"
                >
                  <ExternalLink size={11} /> Open
                </a>
              )}
            </div>
            {url ? (
              <iframe
                title={document.name}
                src={url}
                className="min-h-0 flex-1 border-0 bg-white"
                allow="clipboard-read; clipboard-write; fullscreen"
              />
            ) : (
              <div className="flex flex-1 items-center justify-center text-xs text-zinc-500">Invalid URL</div>
            )}
            <div className="shrink-0 border-t border-zinc-800 px-3 py-1 text-[9px] text-zinc-600">
              If the site blocks embedding, use Open to access it directly.
            </div>
          </div>
        );
      },
    }],
    resourceActions: [
      {
        id: 'open-external',
        labelKey: 'resource.openExternal',
        icon: ExternalLink,
        order: 10,
        canRun: (resource) => resource.kind === 'remote-url' && Boolean(resource.url),
        run: (resource, _document, capabilities) => { if (resource.url) capabilities.openExternal(resource.url); },
      },
      {
        id: 'copy-url',
        labelKey: 'resource.copyUrl',
        icon: Copy,
        order: 20,
        canRun: (resource) => resource.kind === 'remote-url',
        run: (resource, _document, capabilities) => capabilities.copyText(resource.url ?? resource.persistentUrl ?? resource.raw),
      },
      {
        id: 'pin-url',
        labelKey: 'resource.pin',
        icon: Pin,
        order: 30,
        canRun: (resource) => resource.kind === 'remote-url',
        run: (resource, _document, capabilities) => capabilities.pinToBoard(resource),
      },
    ],
  },
};
