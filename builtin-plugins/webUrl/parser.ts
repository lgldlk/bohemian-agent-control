import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import type {
  BoardTerminalLinkContext,
  BoardTerminalLinkMatch,
} from '@/plugin-system';

const SENSITIVE_PARAM = /(?:token|key|secret|password|passwd|auth|signature|credential|session|code)/i;
const DOMAIN_LABEL = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?';
const URL_CANDIDATE = new RegExp(
  `(?:https?:\\/\\/|www\\.)[^\\s<>"'\\x60]+|(?:localhost|[\\w-]+\\.localhost|127(?:\\.\\d{1,3}){3}|\\[::1\\])(?::\\d{1,5})?(?:\\/[^\\s<>"'\\x60]*)?|(?:${DOMAIN_LABEL}\\.)+[A-Za-z]{2,63}(?::\\d{1,5})?(?:\\/[^\\s<>"'\\x60]*)?`,
  'gi',
);
const URL_TRAILING = new Set([',', ';', '.', '!', '?', ':', ')', ']', '}']);
const FILE_LIKE_TLDS = new Set([
  'c', 'cc', 'cpp', 'css', 'csv', 'go', 'h', 'hpp', 'html', 'java', 'js', 'json', 'jsx',
  'log', 'md', 'mjs', 'pdf', 'png', 'py', 'rb', 'rs', 'sh', 'sql', 'svg', 'toml', 'ts',
  'tsx', 'txt', 'vue', 'xml', 'yaml', 'yml',
]);

function trimUrl(value: string): string {
  let end = value.length;
  while (end > 0 && URL_TRAILING.has(value[end - 1])) end -= 1;
  return value.slice(0, end);
}

function validHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) return null;
    if (url.port && Number(url.port) > 65535) return null;
    return url;
  } catch {
    return null;
  }
}

function isBareCandidate(value: string): boolean {
  return !/^https?:\/\//i.test(value) && !/^www\./i.test(value);
}

function looksLikeFilePath(lineText: string, startIndex: number, candidate: string): boolean {
  if (!isBareCandidate(candidate)) return false;
  const prefix = lineText.slice(Math.max(0, startIndex - 64), startIndex);
  if (/[A-Za-z][A-Za-z0-9+.-]*:$/.test(prefix)) return true;
  const preceding = startIndex > 0 ? lineText[startIndex - 1] : '';
  if (preceding && /[A-Za-z0-9_@./\\-]/.test(preceding)) return true;
  const host = candidate.split(/[/:]/, 1)[0];
  const suffix = host.split('.').pop()?.toLowerCase() ?? '';
  return !candidate.includes('/') && !candidate.includes(':') && FILE_LIKE_TLDS.has(suffix);
}

function persistentUrl(url: URL): { value: string; sensitive: boolean } {
  const sensitive = Boolean(url.username || url.password)
    || [...url.searchParams.keys()].some((key) => SENSITIVE_PARAM.test(key));
  return { value: url.toString(), sensitive };
}

function resourceMatch(
  rawValue: string,
  context: BoardTerminalLinkContext,
  startIndex: number,
): BoardTerminalLinkMatch | null {
  const raw = trimUrl(rawValue);
  if (!raw) return null;
  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  const url = validHttpUrl(normalized);
  if (!url) return null;
  const persisted = persistentUrl(url);
  const resource: TerminalResourceRef = {
    kind: 'remote-url',
    raw,
    url: url.toString(),
    persistentUrl: persisted.value,
    sensitive: persisted.sensitive,
    displayText: raw,
    cwd: context.cwd,
    line: null,
    column: null,
    terminalId: context.terminalId,
    agentKind: context.agentKind,
    previewKind: 'link',
  };
  return {
    startIndex,
    endIndex: startIndex + raw.length,
    resource,
    plainClick: 'external',
  };
}

export function extractTerminalWebLinks(
  lineText: string,
  context: BoardTerminalLinkContext,
): BoardTerminalLinkMatch[] {
  const matches: BoardTerminalLinkMatch[] = [];
  URL_CANDIDATE.lastIndex = 0;
  for (const found of lineText.matchAll(URL_CANDIDATE)) {
    const startIndex = found.index ?? 0;
    const candidate = found[0];
    if (looksLikeFilePath(lineText, startIndex, candidate)) continue;
    const match = resourceMatch(candidate, context, startIndex);
    if (match) matches.push(match);
  }
  return matches;
}

export function isSafeHttpUrl(value: string): boolean {
  return validHttpUrl(value) !== null;
}
