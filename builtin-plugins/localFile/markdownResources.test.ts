import { describe, expect, it } from 'vitest';
import { markdownImagePreviewUrl } from './markdownResources';

describe('markdown embedded resource URLs', () => {
  it('resolves a relative image against the Markdown file directory', () => {
    expect(markdownImagePreviewUrl('./assets/preview image.png', '/repo/test/README.md', '/repo'))
      .toBe('/api/fs/preview?path=.%2Fassets%2Fpreview+image.png&cwd=%2Frepo%2Ftest');
  });

  it('supports local file URLs', () => {
    expect(markdownImagePreviewUrl('file:///repo/assets/preview.svg', '/repo/README.md', '/repo'))
      .toBe('/api/fs/preview?path=%2Frepo%2Fassets%2Fpreview.svg&cwd=%2Frepo');
  });

  it('allows direct web and embedded image sources while blocking active protocols', () => {
    expect(markdownImagePreviewUrl('https://example.com/tracker.png', '/repo/README.md', '/repo'))
      .toBe('https://example.com/tracker.png');
    expect(markdownImagePreviewUrl('//cdn.example.com/image.png', '/repo/README.md', '/repo'))
      .toBe('https://cdn.example.com/image.png');
    expect(markdownImagePreviewUrl('data:image/png;base64,abc', '/repo/README.md', '/repo'))
      .toBe('data:image/png;base64,abc');
    expect(markdownImagePreviewUrl('javascript:alert(1)', '/repo/README.md', '/repo')).toBeUndefined();
  });
});
