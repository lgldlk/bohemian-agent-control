import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import type { BoardResourceRendererProps } from '@/plugin-system';
import { buildCodePreviewWindow, codeLanguage } from './codePreviewModel';

type HighlightToken = {
  content: string;
  color?: string;
  fontStyle?: number;
};

type HighlightResult = {
  lines: HighlightToken[][];
  background: string;
  foreground: string;
};

const highlightCache = new Map<string, Promise<HighlightResult>>();
const MAX_HIGHLIGHT_CACHE = 32;

function tokenStyle(token: HighlightToken): CSSProperties {
  const style = token.fontStyle ?? 0;
  return {
    color: token.color,
    fontStyle: style & 1 ? 'italic' : undefined,
    fontWeight: style & 2 ? 600 : undefined,
    textDecoration: style & 4 ? 'underline' : undefined,
  };
}

async function highlight(code: string, language: string): Promise<HighlightResult> {
  const key = `${language}\0${code}`;
  const cached = highlightCache.get(key);
  if (cached) return cached;
  const promise: Promise<HighlightResult> = language === 'text'
    ? Promise.resolve({
        lines: code.split('\n').map((line) => [{ content: line }]),
        background: '#0d1117',
        foreground: '#e6edf3',
      })
    : import('./shikiPreview').then(async ({ tokenizeCode }) => {
        const result = await tokenizeCode(code, language);
        if (!result) {
          return {
            lines: code.split('\n').map((line) => [{ content: line }]),
            background: '#0d1117',
            foreground: '#e6edf3',
          };
        }
        return {
          lines: result.tokens.map((line) => line.map((token) => ({
            content: token.content,
            color: token.color,
            fontStyle: token.fontStyle,
          }))),
          background: result.bg ?? '#0d1117',
          foreground: result.fg ?? '#e6edf3',
        };
      });
  if (highlightCache.size >= MAX_HIGHLIGHT_CACHE) {
    highlightCache.delete(highlightCache.keys().next().value as string);
  }
  highlightCache.set(key, promise);
  return promise;
}

function rangeLabel(resource: BoardResourceRendererProps['document']['resource']): string | null {
  if (!resource.line) return null;
  const start = `${resource.line}${resource.column ? `:${resource.column}` : ''}`;
  if (!resource.endLine || resource.endLine <= resource.line) return `Line ${start}`;
  const end = `${resource.endLine}${resource.endColumn ? `:${resource.endColumn}` : ''}`;
  return `Lines ${start}–${end}`;
}

export function CodePreview({ document, surface }: BoardResourceRendererProps) {
  const content = document.text ?? '';
  const language = codeLanguage(document.resource.path);
  const preview = useMemo(
    () => buildCodePreviewWindow(content, document.resource, {
      contextLines: surface === 'board' ? 4 : 8,
      maxLines: surface === 'board' ? 260 : 600,
    }),
    [content, document.resource, surface],
  );
  const snippet = useMemo(() => preview.lines.join('\n'), [preview.lines]);
  const [highlighted, setHighlighted] = useState<HighlightResult | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setHighlighted(null);
    void highlight(snippet, language).then((result) => {
      if (!cancelled) setHighlighted(result);
    });
    return () => { cancelled = true; };
  }, [language, snippet]);

  useEffect(() => {
    if (!highlighted || !preview.targetStart) return;
    const target = scrollRef.current?.querySelector<HTMLElement>(`[data-line="${preview.targetStart}"]`);
    target?.scrollIntoView({ block: 'center' });
  }, [highlighted, preview.targetStart]);

  const lines = highlighted?.lines ?? preview.lines.map((line) => [{ content: line }]);
  const label = rangeLabel(document.resource);
  const board = surface === 'board';

  return (
    <div className="flex h-full min-h-0 flex-col bg-[#0d1117]" style={{ color: highlighted?.foreground ?? '#e6edf3' }}>
      <div className="flex min-h-7 shrink-0 items-center gap-2 border-b border-white/10 bg-black/20 px-3 font-mono text-[9px] text-zinc-500">
        <span className="uppercase text-zinc-400">{language}</span>
        {label && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-amber-300">{label}</span>}
        <span className="ml-auto">{preview.startLine}–{preview.endLine} / {preview.totalLines}</span>
      </div>
      <div ref={scrollRef} className={`min-h-0 flex-1 overscroll-contain overflow-auto font-mono ${board ? 'text-[10px] leading-4' : 'text-xs leading-5'}`}>
        {preview.truncatedBefore && <div className="border-b border-white/5 px-3 py-1 text-[9px] text-zinc-600">… earlier lines hidden …</div>}
        <div className="min-w-max py-2">
          {lines.map((tokens, index) => {
            const lineNumber = preview.startLine + index;
            const target = preview.targetStart !== null
              && lineNumber >= preview.targetStart
              && lineNumber <= (preview.targetEnd ?? preview.targetStart);
            return (
              <div
                key={lineNumber}
                data-line={lineNumber}
                className={`flex min-h-[1.25em] ${target ? 'bg-amber-400/12 shadow-[inset_2px_0_0_#fbbf24]' : 'hover:bg-white/[0.025]'}`}
              >
                <span className={`sticky left-0 w-12 shrink-0 select-none border-r border-white/5 bg-[#0d1117] pr-2 text-right ${target ? 'text-amber-300' : 'text-zinc-700'}`}>
                  {lineNumber}
                </span>
                <code className="block whitespace-pre px-3">
                  {tokens.length === 0 ? ' ' : tokens.map((token, tokenIndex) => (
                    <span key={`${lineNumber}:${tokenIndex}`} style={tokenStyle(token)}>{token.content}</span>
                  ))}
                </code>
              </div>
            );
          })}
        </div>
        {preview.truncatedAfter && <div className="border-t border-white/5 px-3 py-1 text-[9px] text-zinc-600">… later lines hidden …</div>}
      </div>
    </div>
  );
}
