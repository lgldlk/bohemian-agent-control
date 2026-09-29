export interface ParsedTerminalFileLink {
  pathText: string;
  displayText: string;
  startIndex: number;
  endIndex: number;
  line: number | null;
  column: number | null;
  endLine: number | null;
  endColumn: number | null;
}

const LOCATION_SUFFIX = '(?:#L\\d+(?:C\\d+)?(?:-L?\\d+(?:C\\d+)?)?|:\\d+(?::\\d+)?(?:-\\d+(?::\\d+)?)?)?';
const FILE_URL_TOKEN = /file:\/\/[^\s<>"'`]+/g;
const PATH_TOKEN = /(?:file:\/\/[^\s<>"'`]+|(?:~[\\/]|\.{1,2}[\\/]|[\\/]|[A-Za-z]:[\\/]|[A-Za-z0-9._-]+[\\/])[^\s<>"'`]+)/g;
const SPACED_PATH_TOKEN = new RegExp(`(?<![A-Za-z0-9._-])(?:~[\\\\/]|\\.{1,2}[\\\\/]|[\\\\/]|[A-Za-z]:[\\\\/])[^\\r\\n<>"'\\x60]*?\\.[A-Za-z0-9_+-]+${LOCATION_SUFFIX}`, 'g');
const RELATIVE_SPACED_PATH_TOKEN = new RegExp(`(?<![A-Za-z0-9._-])(?:[A-Za-z0-9._-]+[\\\\/])+[^\\r\\n<>"'\\x60]*?\\.[A-Za-z0-9_+-]+${LOCATION_SUFFIX}`, 'g');
const BARE_FILE = new RegExp(`\\b[A-Za-z0-9][A-Za-z0-9._+-]{1,119}\\.[A-Za-z0-9]{1,12}${LOCATION_SUFFIX}\\b`, 'g');
const TRAILING = new Set([',', ';', '.', '!', '?', ':', ')', ']', '}']);

function trimCandidate(value: string): string {
  let end = value.length;
  while (end > 0 && TRAILING.has(value[end - 1])) end -= 1;
  return value.slice(0, end);
}

type ParsedLocation = Pick<ParsedTerminalFileLink, 'pathText' | 'line' | 'column' | 'endLine' | 'endColumn'>;

function location(
  pathText: string,
  line: number | null = null,
  column: number | null = null,
  endLine: number | null = null,
  endColumn: number | null = null,
): ParsedLocation {
  if (line !== null && endLine !== null && endLine < line) endLine = line;
  return { pathText, line, column, endLine, endColumn };
}

function parseLocation(value: string): ParsedLocation {
  const hashRange = /^(.*)#L(\d+)(?:C(\d+))?(?:-L?(\d+)(?:C(\d+))?)?$/i.exec(value);
  if (hashRange && !/[\\/]$/.test(hashRange[1])) {
    return location(
      hashRange[1],
      Number(hashRange[2]),
      hashRange[3] ? Number(hashRange[3]) : null,
      hashRange[4] ? Number(hashRange[4]) : null,
      hashRange[5] ? Number(hashRange[5]) : null,
    );
  }

  const lineRange = /^(.*?):(\d+)(?::(\d+))?-(\d+)(?::(\d+))?$/.exec(value);
  if (lineRange && !/[\\/]$/.test(lineRange[1])) {
    return location(
      lineRange[1],
      Number(lineRange[2]),
      lineRange[3] ? Number(lineRange[3]) : null,
      Number(lineRange[4]),
      lineRange[5] ? Number(lineRange[5]) : null,
    );
  }

  const single = /^(.*?):(\d+)(?::(\d+))?$/.exec(value);
  if (single && !/[\\/]$/.test(single[1])) {
    return location(
      single[1],
      Number(single[2]),
      single[3] ? Number(single[3]) : null,
    );
  }
  return location(value);
}

function parseCandidate(raw: string, startIndex: number): ParsedTerminalFileLink | null {
  const displayText = trimCandidate(raw);
  if (!displayText || /^(?:https?|wss?):\/\//i.test(displayText)) return null;
  const parsed = parseLocation(displayText);
  if (/^file:\/\//i.test(parsed.pathText)) {
    try {
      const url = new URL(parsed.pathText);
      if (url.hostname && url.hostname !== 'localhost') return null;
      return {
        ...parsed,
        pathText: decodeURIComponent(url.pathname),
        displayText,
        startIndex,
        endIndex: startIndex + displayText.length,
      };
    } catch {
      return null;
    }
  }
  if (!/[\\/]/.test(parsed.pathText) && !/\.[A-Za-z0-9]+$/.test(parsed.pathText)) return null;
  return { ...parsed, displayText, startIndex, endIndex: startIndex + displayText.length };
}

export function extractTerminalFileLinks(lineText: string): ParsedTerminalFileLink[] {
  if (!/[./\\]/.test(lineText)) return [];
  const links: ParsedTerminalFileLink[] = [];
  const claimed: Array<[number, number]> = [];
  const remoteUrlRanges = lineText.includes('://')
    ? [...lineText.matchAll(/https?:\/\/[^\s<>"'`]+/gi)].map((match) => [
        match.index ?? 0,
        (match.index ?? 0) + match[0].length,
      ] as const)
    : [];
  const overlapsRemoteUrl = (start: number, end: number) =>
    remoteUrlRanges.some(([left, right]) => start < right && end > left);
  for (const regex of [FILE_URL_TOKEN, SPACED_PATH_TOKEN, RELATIVE_SPACED_PATH_TOKEN, PATH_TOKEN]) {
    regex.lastIndex = 0;
    for (const match of lineText.matchAll(regex)) {
      const start = match.index ?? 0;
      if (/[A-Za-z][A-Za-z0-9+.-]*:$/.test(lineText.slice(0, start).slice(-64))) continue;
      const candidate = parseCandidate(match[0], start);
      if (
        !candidate
        || overlapsRemoteUrl(candidate.startIndex, candidate.endIndex)
        || claimed.some(([left, right]) => start < right && candidate.endIndex > left)
      ) continue;
      links.push(candidate);
      claimed.push([candidate.startIndex, candidate.endIndex]);
    }
  }
  BARE_FILE.lastIndex = 0;
  for (const match of lineText.matchAll(BARE_FILE)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlapsRemoteUrl(start, end) || claimed.some(([left, right]) => start < right && end > left)) continue;
    const candidate = parseCandidate(match[0], start);
    if (candidate) links.push(candidate);
  }
  return links.sort((a, b) => a.startIndex - b.startIndex || b.endIndex - a.endIndex);
}

export function resolveTerminalFileLinkPath(pathText: string, cwd: string): string | null {
  if (!cwd) return null;
  if (/^~[\\/]/.test(pathText)) return pathText;
  if (/^[A-Za-z]:[\\/]/.test(pathText) || pathText.startsWith('/') || pathText.startsWith('\\\\')) {
    return normalizePath(pathText);
  }
  return normalizePath(`${cwd.replace(/[\\/]$/, '')}/${pathText}`);
}

function normalizePath(value: string): string {
  const windows = /^[A-Za-z]:[\\/]/.test(value);
  const prefix = value.startsWith('/') ? '/' : windows ? value.slice(0, 3) : '';
  const body = windows ? value.slice(3) : value.replace(/^\/+/, '');
  const parts: string[] = [];
  for (const part of body.split(/[\\/]+/)) {
    if (!part || part === '.') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return `${prefix}${parts.join('/')}` || prefix || '.';
}
