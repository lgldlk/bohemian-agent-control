import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  c: 'c', cc: 'cpp', cpp: 'cpp', css: 'css', go: 'go', h: 'c', hpp: 'cpp',
  html: 'html', java: 'java', js: 'javascript', json: 'json', jsx: 'jsx', md: 'markdown',
  mjs: 'javascript', py: 'python', rb: 'ruby', rs: 'rust', sh: 'bash', sql: 'sql',
  svg: 'xml', toml: 'toml', ts: 'typescript', tsx: 'tsx', vue: 'vue', xml: 'xml',
  yaml: 'yaml', yml: 'yaml', csv: 'csv', txt: 'text', log: 'text',
};

export interface CodePreviewWindow {
  lines: string[];
  startLine: number;
  endLine: number;
  totalLines: number;
  targetStart: number | null;
  targetEnd: number | null;
  truncatedBefore: boolean;
  truncatedAfter: boolean;
}

export function codeLanguage(path: string | undefined): string {
  const extension = path?.split(/[?#]/, 1)[0].split('.').pop()?.toLowerCase() ?? '';
  return LANGUAGE_BY_EXTENSION[extension] ?? 'text';
}

export function isMarkdownResource(resource: TerminalResourceRef): boolean {
  return /\.(?:md|mdown|markdown)$/i.test(resource.path ?? '');
}

export function buildCodePreviewWindow(
  content: string,
  resource: Pick<TerminalResourceRef, 'line' | 'endLine'>,
  options: { contextLines?: number; maxLines?: number } = {},
): CodePreviewWindow {
  const contextLines = options.contextLines ?? 4;
  const maxLines = options.maxLines ?? 400;
  const allLines = content.replace(/\r\n?/g, '\n').split('\n');
  const totalLines = allLines.length;
  const requestedStart = resource.line && resource.line > 0
    ? Math.min(resource.line, totalLines)
    : null;
  const requestedEnd = requestedStart === null
    ? null
    : Math.min(Math.max(resource.endLine ?? requestedStart, requestedStart), totalLines);

  let startLine = requestedStart === null ? 1 : Math.max(1, requestedStart - contextLines);
  let endLine = requestedEnd === null
    ? Math.min(totalLines, maxLines)
    : Math.min(totalLines, requestedEnd + contextLines);

  if (endLine - startLine + 1 > maxLines) {
    if (requestedStart === null) endLine = startLine + maxLines - 1;
    else if ((requestedEnd ?? requestedStart) - requestedStart + 1 >= maxLines) {
      startLine = requestedStart;
      endLine = Math.min(totalLines, startLine + maxLines - 1);
    } else {
      endLine = startLine + maxLines - 1;
    }
  }

  return {
    lines: allLines.slice(startLine - 1, endLine),
    startLine,
    endLine,
    totalLines,
    targetStart: requestedStart,
    targetEnd: requestedEnd,
    truncatedBefore: startLine > 1,
    truncatedAfter: endLine < totalLines,
  };
}
