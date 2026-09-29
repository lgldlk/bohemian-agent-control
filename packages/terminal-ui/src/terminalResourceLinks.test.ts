import { describe, expect, it, vi } from 'vitest';
import type { ILink } from '@xterm/xterm';
import {
  createTerminalResourceLinksProvider,
  findTerminalResourceAtPosition,
  installTerminalResourceLinkClickFallback,
  terminalBufferPosition,
  type TerminalResourceLinksOptions,
} from './terminalResourceLinks';
import type { TerminalResourceLinkResolver } from './terminalResources';

function resourceResolver(findLinks: TerminalResourceLinkResolver['findLinks']): TerminalResourceLinkResolver {
  return { id: 'test-links', findLinks };
}

function linkOptions(
  resolver: TerminalResourceLinkResolver,
  onActivate = vi.fn(),
): TerminalResourceLinksOptions {
  return {
    resolvers: [resolver],
    context: { cwd: '/repo', terminalId: 'term-1', agentKind: 'pi' },
    capabilities: {},
    onActivate,
  };
}

function provideLinks(
  provider: ReturnType<typeof createTerminalResourceLinksProvider>,
  line = 1,
): Promise<ILink[] | undefined> {
  return new Promise((resolve) => provider.provideLinks(line, resolve));
}

describe('terminal resource links', () => {
  it('maps a zoomed screen click to the correct terminal cell', () => {
    const screen = {
      getBoundingClientRect: () => ({ left: 100, top: 200, width: 200, height: 100 }),
      offsetWidth: 400,
      offsetHeight: 200,
    };
    const terminal = {
      element: { querySelector: () => screen },
      dimensions: { css: { cell: { width: 10, height: 20 } } },
      cols: 20,
      buffer: { active: { viewportY: 3 } },
    } as never;
    expect(terminalBufferPosition(terminal, { clientX: 150, clientY: 250 } as MouseEvent))
      .toEqual({ x: 11, y: 8 });
  });

  it('parses each unchanged row once and reuses the cached result', async () => {
    const findLinks = vi.fn((text: string) => [{
      startIndex: 0,
      endIndex: text.length,
      resource: {
        kind: 'remote-url' as const,
        raw: text,
        url: 'https://example.com/',
        displayText: text,
        cwd: '/repo',
        line: null,
        column: null,
      },
    }]);
    const provider = createTerminalResourceLinksProvider(() => 'example.com', linkOptions(resourceResolver(findLinks)));
    await provideLinks(provider);
    await provideLinks(provider);
    expect(findLinks).toHaveBeenCalledOnce();
    provider.disposeValidation();
  });

  it('bounds pathological rows before invoking plugin parsers', async () => {
    const findLinks = vi.fn(() => []);
    const provider = createTerminalResourceLinksProvider(
      () => 'x'.repeat(20_000),
      linkOptions(resourceResolver(findLinks)),
    );
    await provideLinks(provider);
    expect(findLinks.mock.calls[0]?.[0]).toHaveLength(4096);
    provider.disposeValidation();
  });

  it('deduplicates asynchronous validation for the same resource', async () => {
    const validateLink = vi.fn(async (match) => match.resource);
    const resolver: TerminalResourceLinkResolver = {
      id: 'validated',
      findLinks: (text) => [{
        startIndex: 0,
        endIndex: text.length,
        resource: {
          kind: 'local-file',
          raw: text,
          path: '/repo/file.txt',
          displayText: text,
          cwd: '/repo',
          line: null,
          column: null,
        },
      }],
      validateLink,
    };
    const provider = createTerminalResourceLinksProvider(() => 'file.txt', linkOptions(resolver));
    await provideLinks(provider);
    await provideLinks(provider);
    expect(validateLink).toHaveBeenCalledOnce();
    provider.disposeValidation();
  });

  it('finds a resource at the visible terminal cell', () => {
    const resolver = resourceResolver((text) => [{
      startIndex: 5,
      endIndex: text.length,
      resource: {
        kind: 'local-file',
        raw: 'src/App.tsx',
        path: '/repo/src/App.tsx',
        displayText: 'src/App.tsx',
        cwd: '/repo',
        line: null,
        column: null,
      },
    }]);
    const terminal = {
      buffer: { active: { getLine: () => ({ translateToString: () => 'open src/App.tsx' }) } },
    } as never;
    expect(findTerminalResourceAtPosition(terminal, { x: 10, y: 0 }, linkOptions(resolver)))
      .toMatchObject({ path: '/repo/src/App.tsx' });
  });

  it('activates only modified clicks in the fallback path', () => {
    const activate = vi.fn();
    const resolver = resourceResolver(() => [{
      startIndex: 0,
      endIndex: 11,
      resource: {
        kind: 'local-file',
        raw: 'src/App.tsx',
        path: '/repo/src/App.tsx',
        displayText: 'src/App.tsx',
        cwd: '/repo',
        line: null,
        column: null,
      },
    }]);
    const screen = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 200, height: 40 }),
      offsetWidth: 200,
      offsetHeight: 40,
    };
    const listeners = new Map<string, (event: MouseEvent) => void>();
    const element = {
      querySelector: () => screen,
      addEventListener: (type: string, listener: (event: MouseEvent) => void) => listeners.set(type, listener),
      removeEventListener: vi.fn(),
    };
    const terminal = {
      element,
      dimensions: { css: { cell: { width: 10, height: 20 } } },
      cols: 20,
      buffer: { active: { viewportY: 0, getLine: () => ({ translateToString: () => 'src/App.tsx' }) } },
      clearSelection: vi.fn(),
    } as never;
    const detach = installTerminalResourceLinkClickFallback(terminal, linkOptions(resolver, activate));
    const event = {
      button: 0,
      metaKey: false,
      ctrlKey: true,
      clientX: 5,
      clientY: 5,
      preventDefault: vi.fn(),
      stopPropagation: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    } as unknown as MouseEvent;
    listeners.get('mousedown')?.(event);
    listeners.get('mouseup')?.(event);
    expect(activate).toHaveBeenCalledOnce();
    expect(terminal.clearSelection).toHaveBeenCalledOnce();
    detach();
  });
});
