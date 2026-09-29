import type { IBufferRange, ILink, ILinkProvider, Terminal } from '@xterm/xterm';
import type {
  TerminalLinkContext,
  TerminalResourceLinkMatch,
  TerminalResourceLinkResolver,
  TerminalResourceRef,
  TerminalResourceLinkCapabilities,
} from './terminalResources';

const MAX_LINK_SCAN_LENGTH = 4096;
const MAX_PARSED_ROWS = 64;
type ResolvedMatch = { resolver: TerminalResourceLinkResolver; match: TerminalResourceLinkMatch };
const parseCache = new WeakMap<TerminalResourceLinksOptions, Map<string, ResolvedMatch[]>>();
const resolverCache = new WeakMap<TerminalResourceLinksOptions, readonly TerminalResourceLinkResolver[]>();
const validationCache = new WeakMap<TerminalResourceLinksOptions, Map<string, Promise<TerminalResourceRef | null>>>();

export interface TerminalResourceLinksOptions {
  resolvers: readonly TerminalResourceLinkResolver[];
  context: TerminalLinkContext;
  getContext?: () => TerminalLinkContext;
  capabilities: TerminalResourceLinkCapabilities;
  onActivate: (resource: TerminalResourceRef, event: MouseEvent) => void;
  openExternal?: (url: string) => void;
}

function currentContext(options: TerminalResourceLinksOptions): TerminalLinkContext {
  return options.getContext?.() ?? options.context;
}

function getSortedResolvers(options: TerminalResourceLinksOptions): readonly TerminalResourceLinkResolver[] {
  let resolvers = resolverCache.get(options);
  if (!resolvers) {
    resolvers = [...options.resolvers].sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
    resolverCache.set(options, resolvers);
  }
  return resolvers;
}

function makeParseKey(text: string, context: TerminalLinkContext): string {
  return `${context.cwd}\0${context.terminalId ?? ''}\0${context.agentKind ?? ''}\0${text}`;
}

function terminalResourceLinksForText(text: string, options: TerminalResourceLinksOptions): ResolvedMatch[] {
  const boundedText = text.length > MAX_LINK_SCAN_LENGTH ? text.slice(0, MAX_LINK_SCAN_LENGTH) : text;
  const context = currentContext(options);
  let cache = parseCache.get(options);
  if (!cache) {
    cache = new Map();
    parseCache.set(options, cache);
  }
  const key = makeParseKey(boundedText, context);
  const cached = cache.get(key);
  if (cached) return cached;

  const claimed: Array<[number, number]> = [];
  const matches: ResolvedMatch[] = [];
  for (const resolver of getSortedResolvers(options)) {
    let candidates: readonly TerminalResourceLinkMatch[];
    try {
      candidates = resolver.findLinks(boundedText, context);
    } catch (error) {
      console.error(`[terminal-resource-link:${resolver.id}] parser failed`, error);
      continue;
    }
    for (const candidate of candidates) {
      if (
        candidate.startIndex < 0
        || candidate.endIndex <= candidate.startIndex
        || candidate.endIndex > boundedText.length
        || claimed.some(([left, right]) => candidate.startIndex < right && candidate.endIndex > left)
      ) continue;
      matches.push({ resolver, match: candidate });
      claimed.push([candidate.startIndex, candidate.endIndex]);
    }
  }
  matches.sort((left, right) => left.match.startIndex - right.match.startIndex || right.match.endIndex - left.match.endIndex);
  if (cache.size >= MAX_PARSED_ROWS) cache.delete(cache.keys().next().value as string);
  cache.set(key, matches);
  return matches;
}

function terminalResourceLinkRange(match: TerminalResourceLinkMatch, line: number): IBufferRange {
  return {
    start: { x: match.startIndex + 1, y: line },
    end: { x: match.endIndex, y: line },
  };
}

function validationFor(
  match: TerminalResourceLinkMatch,
  resolver: TerminalResourceLinkResolver,
  context: TerminalLinkContext,
  options: TerminalResourceLinksOptions,
  signal: AbortSignal,
): Promise<TerminalResourceRef | null> {
  if (!resolver.validateLink) return Promise.resolve(match.resource);
  let cache = validationCache.get(options);
  if (!cache) {
    cache = new Map();
    validationCache.set(options, cache);
  }
  const key = `${resolver.id}\0${context.cwd}\0${match.resource.path ?? match.resource.url ?? match.resource.raw}`;
  const existing = cache.get(key);
  if (existing) return existing;
  const result = Promise.resolve()
    .then(() => resolver.validateLink!(match, context, options.capabilities, signal))
    .catch((error: unknown) => {
      if (!signal.aborted) console.error(`[terminal-resource-link:${resolver.id}] validation failed`, error);
      return null;
    });
  cache.set(key, result);
  if (cache.size > MAX_PARSED_ROWS * 2) cache.delete(cache.keys().next().value as string);
  return result;
}

function activateMatch(match: TerminalResourceLinkMatch, event: MouseEvent, options: TerminalResourceLinksOptions): void {
  if (terminalLinkMouseEvent(event)) {
    options.onActivate(match.resource, event);
    return;
  }
  if (match.plainClick === 'external' && match.resource.url) options.openExternal?.(match.resource.url);
}

export function createTerminalResourceLinksProvider(
  readLine: (line: number) => string,
  options: TerminalResourceLinksOptions,
): ILinkProvider & { disposeValidation(): void } {
  const validationController = new AbortController();
  return {
    provideLinks(bufferLineNumber, callback) {
      const text = readLine(bufferLineNumber);
      const matches = terminalResourceLinksForText(text, options);
      if (matches.length === 0) {
        callback(undefined);
        return;
      }
      const context = currentContext(options);
      void Promise.all(matches.map(async ({ resolver, match }) => {
        const resource = await validationFor(match, resolver, context, options, validationController.signal);
        if (!resource) return null;
        return {
          range: terminalResourceLinkRange(match, bufferLineNumber),
          text: match.resource.displayText,
          activate: (event: MouseEvent, _text: string) => activateMatch({ ...match, resource }, event, options),
        } satisfies ILink;
      })).then((links) => {
        if (validationController.signal.aborted) return;
        const valid = links.filter((link): link is ILink => link !== null);
        callback(valid.length > 0 ? valid : undefined);
      }).catch(() => {
        if (!validationController.signal.aborted) callback(undefined);
      });
    },
    disposeValidation() {
      validationController.abort();
      validationCache.get(options)?.clear();
      parseCache.get(options)?.clear();
      parseCache.delete(options);
      resolverCache.delete(options);
      validationCache.delete(options);
    },
  };
}

function terminalCellAtMouse(terminal: Terminal, event: MouseEvent): { x: number; y: number } | null {
  const screen = terminal.element?.querySelector('.xterm-screen') as (Element & {
    offsetWidth?: number;
    offsetHeight?: number;
  }) | null;
  const cell = terminal.dimensions?.css.cell;
  if (
    !screen
    || !cell?.width
    || !cell.height
    || typeof screen.getBoundingClientRect !== 'function'
    || typeof screen.offsetWidth !== 'number'
    || typeof screen.offsetHeight !== 'number'
  ) return null;
  const rect = screen.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scaleX = screen.offsetWidth > 0 ? screen.offsetWidth / rect.width : 1;
  const scaleY = screen.offsetHeight > 0 ? screen.offsetHeight / rect.height : 1;
  const x = Math.floor((event.clientX - rect.left) * scaleX / cell.width) + 1;
  const y = Math.floor((event.clientY - rect.top) * scaleY / cell.height) + terminal.buffer.active.viewportY;
  if (x < 1 || y < 0 || x > terminal.cols) return null;
  return { x, y };
}

export function findTerminalResourceAtPosition(
  terminal: Terminal,
  position: { x: number; y: number },
  options: TerminalResourceLinksOptions,
): TerminalResourceRef | null {
  const text = terminal.buffer.active.getLine(position.y)?.translateToString(true) ?? '';
  const found = terminalResourceLinksForText(text, options).find(({ match }) =>
    position.x >= match.startIndex + 1 && position.x <= match.endIndex,
  );
  return found?.match.resource ?? null;
}

export function installTerminalResourceLinkClickFallback(
  terminal: Terminal,
  options: TerminalResourceLinksOptions,
): () => void {
  const resourceAt = (event: MouseEvent): TerminalResourceRef | null => {
    if (!terminalLinkMouseEvent(event)) return null;
    const position = terminalCellAtMouse(terminal, event);
    return position ? findTerminalResourceAtPosition(terminal, position, options) : null;
  };
  const onMouseDown = (event: MouseEvent) => {
    if (!resourceAt(event)) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
  };
  const onMouseUp = (event: MouseEvent) => {
    const resource = resourceAt(event);
    if (!resource) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    options.onActivate(resource, event);
    terminal.clearSelection();
  };
  terminal.element?.addEventListener('mousedown', onMouseDown, true);
  terminal.element?.addEventListener('mouseup', onMouseUp, true);
  return () => {
    terminal.element?.removeEventListener('mousedown', onMouseDown, true);
    terminal.element?.removeEventListener('mouseup', onMouseUp, true);
  };
}

export function terminalLinkMouseEvent(event: MouseEvent): boolean {
  return event.button === 0 && (event.metaKey || event.ctrlKey);
}

export { terminalCellAtMouse as terminalBufferPosition };
