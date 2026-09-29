import { lazy, Suspense } from 'react';
import type { BoardResourceDocument, BoardResourceRendererProps } from '@/plugin-system';
import { CodePreview } from './CodePreview';
import { isMarkdownResource } from './codePreviewModel';

const MarkdownPreview = lazy(() => import('./MarkdownPreview').then(({ MarkdownPreview: Component }) => ({ default: Component })));

function formatBytes(value: number | undefined): string {
  if (value === undefined) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function metadata(document: BoardResourceDocument): string {
  return [document.mimeType?.split(';')[0], formatBytes(document.size)].filter(Boolean).join(' · ');
}

export function LocalFilePreview({ document, previewUrl, surface }: BoardResourceRendererProps) {
  const board = surface === 'board';
  const meta = metadata(document);
  if (document.previewKind === 'directory') {
    return (
      <div className={`flex h-full flex-col items-center justify-center gap-2 text-zinc-400 ${board ? 'p-3 text-[11px]' : 'min-h-[30vh] p-8 text-sm'}`}>
        <div className="text-sm font-medium text-zinc-200">{document.name}</div>
        <div className="max-w-full truncate font-mono text-[10px] text-zinc-600">{document.resource.path}</div>
        <div className="text-[10px] uppercase tracking-wide text-zinc-600">Directory</div>
      </div>
    );
  }
  if (document.previewKind === 'image') {
    return (
      <div className="relative h-full overflow-hidden bg-[linear-gradient(45deg,#18181b_25%,transparent_25%),linear-gradient(-45deg,#18181b_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#18181b_75%),linear-gradient(-45deg,transparent_75%,#18181b_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0px]">
        <img src={previewUrl} alt={document.name} className="h-full w-full object-contain" />
        {meta && <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 font-mono text-[9px] text-zinc-300 backdrop-blur">{meta}</div>}
      </div>
    );
  }
  if (document.previewKind === 'text') {
    const markdown = isMarkdownResource(document.resource) && !document.resource.line;
    if (markdown) {
      return (
        <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-zinc-500">Rendering Markdown…</div>}>
          <MarkdownPreview document={document} previewUrl={previewUrl} surface={surface} />
        </Suspense>
      );
    }
    return <CodePreview document={document} previewUrl={previewUrl} surface={surface} />;
  }
  if (['pdf', 'audio', 'video'].includes(document.previewKind) && previewUrl) {
    if (document.previewKind === 'audio') {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-4 bg-zinc-900 p-5">
          <div className="text-sm font-medium text-zinc-200">{document.name}</div>
          <audio controls src={previewUrl} className="w-full" />
          {meta && <div className="font-mono text-[10px] text-zinc-500">{meta}</div>}
        </div>
      );
    }
    if (document.previewKind === 'video') {
      return <video controls src={previewUrl} className="h-full w-full bg-black object-contain" />;
    }
    return <iframe title={document.name} src={previewUrl} className="h-full w-full bg-white" />;
  }
  return (
    <div className={`flex h-full flex-col items-center justify-center gap-2 text-center text-zinc-400 ${board ? 'p-3 text-[11px]' : 'p-8 text-sm'}`}>
      <div className="text-sm font-medium text-zinc-200">{document.name}</div>
      {meta && <div className="font-mono text-[10px] text-zinc-500">{meta}</div>}
      <div>Preview unavailable for this binary format.</div>
    </div>
  );
}
