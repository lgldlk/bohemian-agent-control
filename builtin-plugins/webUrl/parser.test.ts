import { describe, expect, it } from 'vitest';
import { extractTerminalWebLinks, isSafeHttpUrl } from './parser';

const context = { cwd: '/repo', terminalId: 'term-1', agentKind: 'pi' };

describe('web URL terminal parser', () => {
  it('recognizes explicit, www, bare-domain, and localhost URLs', () => {
    const links = extractTerminalWebLinks(
      'https://example.com/a www.example.org example.net localhost:18720/app',
      context,
    );
    expect(links.map((link) => link.resource.url)).toEqual([
      'https://example.com/a',
      'https://www.example.org/',
      'https://example.net/',
      'https://localhost:18720/app',
    ]);
  });

  it('keeps precise ranges when URLs follow punctuation or assignment', () => {
    const line = 'open=(https://example.com/path), next=https://example.org';
    const links = extractTerminalWebLinks(line, context);
    expect(links.map((link) => line.slice(link.startIndex, link.endIndex))).toEqual([
      'https://example.com/path',
      'https://example.org',
    ]);
  });

  it('does not mistake file paths, emails, or dangerous schemes for web URLs', () => {
    const links = extractTerminalWebLinks(
      'src/App.tsx report.pdf person@example.com javascript:example.com file://example.com/a',
      context,
    );
    expect(links).toEqual([]);
  });

  it('keeps credential-bearing URLs usable', () => {
    const [link] = extractTerminalWebLinks('https://user:pass@example.com/path', context);
    expect(link.resource.url).toBe('https://user:pass@example.com/path');
    expect(link.resource.sensitive).toBe(true);
    expect(isSafeHttpUrl('https://user:pass@example.com/path')).toBe(true);
  });

  it('keeps sensitive query values in the persisted URL', () => {
    const [link] = extractTerminalWebLinks('https://example.com/callback?token=secret&tab=1', context);
    expect(link.resource.url).toContain('token=secret');
    expect(link.resource.persistentUrl).toContain('token=secret');
    expect(link.resource.persistentUrl).toContain('tab=1');
    expect(link.resource.sensitive).toBe(true);
  });
});
