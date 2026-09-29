import { describe, expect, it } from 'vitest';
import { extractTerminalFileLinks, resolveTerminalFileLinkPath } from './parser';

describe('local file terminal parser', () => {
  it('parses paths with line, column, and line-range locations', () => {
    expect(extractTerminalFileLinks('failed at src/App.tsx:42:7')[0]).toMatchObject({
      pathText: 'src/App.tsx',
      line: 42,
      column: 7,
      endLine: null,
    });
    expect(extractTerminalFileLinks('changed src/App.tsx:1-15')[0]).toMatchObject({
      pathText: 'src/App.tsx',
      line: 1,
      endLine: 15,
    });
    expect(extractTerminalFileLinks('changed src/App.tsx:10:3-15:8')[0]).toMatchObject({
      pathText: 'src/App.tsx',
      line: 10,
      column: 3,
      endLine: 15,
      endColumn: 8,
    });
    expect(extractTerminalFileLinks('changed src/App.tsx#L20-L28')[0]).toMatchObject({
      pathText: 'src/App.tsx',
      line: 20,
      endLine: 28,
    });
  });

  it('trims prose punctuation and preserves spaces', () => {
    expect(extractTerminalFileLinks('saved ./output/result.png.')[0]?.displayText).toBe('./output/result.png');
    expect(extractTerminalFileLinks('/Users/me/My Project/result.png')[0]?.displayText)
      .toBe('/Users/me/My Project/result.png');
    expect(extractTerminalFileLinks('open test/resource-preview-gallery/assets/preview with spaces.png')[0])
      .toMatchObject({
        pathText: 'test/resource-preview-gallery/assets/preview with spaces.png',
        displayText: 'test/resource-preview-gallery/assets/preview with spaces.png',
      });
    expect(extractTerminalFileLinks('changed test/My Project/App.tsx:3-9')[0])
      .toMatchObject({ pathText: 'test/My Project/App.tsx', line: 3, endLine: 9 });
  });

  it('resolves relative and absolute paths against cwd', () => {
    expect(resolveTerminalFileLinkPath('./output/result.png', '/repo')).toBe('/repo/output/result.png');
    expect(resolveTerminalFileLinkPath('../shared/a.txt', '/repo/src')).toBe('/repo/shared/a.txt');
    expect(resolveTerminalFileLinkPath('/tmp/result.png', '/repo')).toBe('/tmp/result.png');
  });

  it('parses local file URLs and rejects progress fractions', () => {
    expect(extractTerminalFileLinks('file:///Users/me/result.png')[0]?.pathText).toBe('/Users/me/result.png');
    expect(extractTerminalFileLinks('progress 1 / 3')).toEqual([]);
  });

  it('does not claim HTTP URLs', () => {
    expect(extractTerminalFileLinks('https://example.com/src/App.tsx')).toEqual([]);
  });
});
