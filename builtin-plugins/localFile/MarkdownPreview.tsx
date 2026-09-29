import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { BoardResourceRendererProps } from '@/plugin-system';
import { markdownImagePreviewUrl } from './markdownResources';

function safeLink(href: string | undefined): string | undefined {
  if (!href) return undefined;
  try {
    const url = new URL(href, window.location.href);
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function MarkdownPreview({ document, surface }: BoardResourceRendererProps) {
  const limit = surface === 'board' ? 120_000 : 400_000;
  const source = (document.text ?? '').slice(0, limit);
  const truncated = (document.text?.length ?? 0) > limit;
  return (
    <div className={`resource-markdown h-full overscroll-contain overflow-auto text-zinc-300 ${surface === 'board' ? 'p-4 text-[11px] leading-5' : 'p-6 text-sm leading-6'}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        components={{
          h1: ({ children }) => <h1 className="mb-4 border-b border-zinc-700 pb-2 text-xl font-semibold text-zinc-100">{children}</h1>,
          h2: ({ children }) => <h2 className="mb-3 mt-6 text-lg font-semibold text-zinc-100">{children}</h2>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 text-base font-semibold text-zinc-200">{children}</h3>,
          p: ({ children }) => <p className="my-3">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-1 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-1 pl-5">{children}</ol>,
          blockquote: ({ children }) => <blockquote className="my-3 border-l-2 border-zinc-600 bg-zinc-900/70 px-3 py-1 text-zinc-400">{children}</blockquote>,
          a: ({ href, children }) => {
            const safe = safeLink(href);
            return safe
              ? <a href={safe} target="_blank" rel="noreferrer" className="text-sky-400 underline decoration-sky-500/40 underline-offset-2">{children}</a>
              : <span className="text-zinc-400">{children}</span>;
          },
          code: ({ className, children }) => className
            ? <code className={`${className} font-mono text-[0.9em] text-zinc-200`}>{children}</code>
            : <code className="rounded bg-zinc-800 px-1 py-0.5 font-mono text-[0.9em] text-amber-200">{children}</code>,
          pre: ({ children }) => <pre className="my-3 overflow-auto rounded border border-zinc-700 bg-[#0d1117] p-3 text-xs leading-5">{children}</pre>,
          table: ({ children }) => <table className="my-4 w-full border-collapse text-left text-[0.95em]">{children}</table>,
          th: ({ children }) => <th className="border border-zinc-700 bg-zinc-800 px-2 py-1 font-medium text-zinc-200">{children}</th>,
          td: ({ children }) => <td className="border border-zinc-800 px-2 py-1 align-top">{children}</td>,
          hr: () => <hr className="my-5 border-zinc-700" />,
          img: ({ src, alt, title }) => {
            const preview = markdownImagePreviewUrl(src, document.resource.path, document.resource.cwd);
            return preview ? (
              <figure className="my-4 overflow-hidden rounded border border-zinc-700 bg-zinc-900/70 p-2">
                <img
                  src={preview}
                  alt={alt ?? ''}
                  title={title}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="mx-auto max-h-[420px] max-w-full object-contain"
                />
                {alt && <figcaption className="mt-2 text-center text-[10px] text-zinc-500">{alt}</figcaption>}
              </figure>
            ) : (
              <span className="inline-flex rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-500">Unsupported image source: {alt || 'embedded image'}</span>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
      {truncated && <div className="mt-4 border-t border-zinc-700 pt-3 text-xs text-amber-300">Preview truncated for performance.</div>}
    </div>
  );
}
