import { Copy, Download, ExternalLink, FolderOpen, Pin } from 'lucide-react';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import { extractTerminalFileLinks, resolveTerminalFileLinkPath } from './parser';
import type {
  BoardPlugin,
  BoardTerminalLinkContext,
  BoardTerminalLinkContribution,
  BoardTerminalLinkMatch,
} from '@/plugin-system';
import { LocalFilePreview } from './LocalFilePreview';

export const localFileTerminalLinkResolver: BoardTerminalLinkContribution = {
  id: 'local-file-path',
  priority: 20,
  findLinks(lineText: string, context: BoardTerminalLinkContext): BoardTerminalLinkMatch[] {
    return extractTerminalFileLinks(lineText).flatMap((link) => {
      const path = resolveTerminalFileLinkPath(link.pathText, context.cwd);
      if (!path) return [];
      return [{
        startIndex: link.startIndex,
        endIndex: link.endIndex,
        resource: {
          kind: 'local-file',
          raw: link.displayText,
          path,
          displayText: link.displayText,
          cwd: context.cwd,
          line: link.line,
          column: link.column,
          endLine: link.endLine,
          endColumn: link.endColumn,
          terminalId: context.terminalId,
          agentKind: context.agentKind,
        },
      }];
    });
  },
  async validateLink(match, context, capabilities, signal): Promise<TerminalResourceRef | null> {
    const path = match.resource.path;
    if (!path || !capabilities.statLocalPath) return null;
    const stat = await capabilities.statLocalPath(path, context.cwd, signal);
    if (!stat) return null;
    return {
      ...match.resource,
      kind: stat.isDirectory ? 'local-directory' : 'local-file',
      previewKind: stat.previewKind,
      mimeType: stat.mimeType,
    };
  },
};

export const localFilePlugin: BoardPlugin = {
  id: 'local-file-resource',
  version: '1.0.0',
  titleKey: 'resource.localFile',
  translations: {
    'zh-CN': { resource: { localFile: '本地文件', pin: '固定到画板', copyPath: '复制路径', openLocal: '用默认应用打开', revealLocal: '在文件管理器中显示', download: '下载文件' } },
    en: { resource: { localFile: 'Local file', pin: 'Pin to board', copyPath: 'Copy path', openLocal: 'Open with default app', revealLocal: 'Show in file manager', download: 'Download file' } },
  },
  resources: {
    terminalLinks: [localFileTerminalLinkResolver],
    resourceImporters: [{
      id: 'local-file-importer',
      priority: 10,
      canImport: (file) => Boolean(file.name.trim()),
      createResource: (imported) => ({
        kind: 'local-file',
        raw: imported.name,
        path: imported.path,
        displayText: imported.name,
        cwd: imported.cwd,
        line: null,
        column: null,
        previewKind: imported.previewKind,
        mimeType: imported.mimeType,
      }),
    }],
    resourceProviders: [{
      id: 'local-file-provider',
      priority: 20,
      canHandle: (resource) => resource.kind === 'local-file' || resource.kind === 'local-directory',
      async load(resource, capabilities, signal) {
        const path = resource.path;
        if (!path) throw new Error('Local resource path is missing');
        const stat = await capabilities.inspectLocalPath(path, resource.cwd, signal);
        return {
          resource: {
            ...resource,
            path: stat.path,
            displayText: resource.displayText || stat.name,
            mimeType: stat.mimeType,
            previewKind: stat.previewKind,
          },
          previewKind: stat.previewKind,
          name: stat.name,
          mimeType: stat.mimeType,
          size: stat.size,
          modifiedAt: stat.modifiedAt,
          text: stat.text,
        };
      },
    }],
    resourceRenderers: [{
      id: 'local-file-preview',
      priority: 10,
      canRender: (document) => document.resource.kind === 'local-file' || document.resource.kind === 'local-directory',
      Component: LocalFilePreview,
    }],
    resourceActions: [
      {
        id: 'pin-to-board', labelKey: 'resource.pin', icon: Pin, order: 10,
        canRun: (resource) => resource.kind === 'local-file' || resource.kind === 'local-directory',
        run: (resource, _document, capabilities) => capabilities.pinToBoard(resource),
      },
      {
        id: 'copy-path', labelKey: 'resource.copyPath', icon: Copy, order: 20,
        canRun: (resource) => (resource.kind === 'local-file' || resource.kind === 'local-directory') && Boolean(resource.path),
        run: (resource, _document, capabilities) => capabilities.copyText(resource.path ?? resource.raw),
      },
      {
        id: 'open-local', labelKey: 'resource.openLocal', icon: ExternalLink, order: 30,
        canRun: (resource) => resource.kind === 'local-file' && Boolean(resource.path),
        run: (resource, _document, capabilities) => capabilities.openLocalPath(resource.path!, resource.cwd, 'open'),
      },
      {
        id: 'reveal-local', labelKey: 'resource.revealLocal', icon: FolderOpen, order: 40,
        canRun: (resource) => Boolean(resource.path),
        run: (resource, _document, capabilities) => capabilities.openLocalPath(resource.path!, resource.cwd, 'reveal'),
      },
      {
        id: 'download-local', labelKey: 'resource.download', icon: Download, order: 50,
        canRun: (resource) => resource.kind === 'local-file' && Boolean(resource.path),
        run: (resource, _document, capabilities) => capabilities.download(resource),
      },
    ],
  },
};
