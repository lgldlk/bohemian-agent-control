import { describe, expect, it } from 'vitest';
import { buildCodePreviewWindow, codeLanguage, isMarkdownResource } from './codePreviewModel';

describe('code preview window', () => {
  const content = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`).join('\n');

  it('shows target ranges with nearby context and real line numbers', () => {
    const window = buildCodePreviewWindow(content, { line: 10, endLine: 15 });
    expect(window.startLine).toBe(6);
    expect(window.endLine).toBe(19);
    expect(window.targetStart).toBe(10);
    expect(window.targetEnd).toBe(15);
    expect(window.lines[4]).toBe('line 10');
  });

  it('limits full-file previews', () => {
    const window = buildCodePreviewWindow(content, { line: null, endLine: null }, { maxLines: 12 });
    expect(window.lines).toHaveLength(12);
    expect(window.truncatedAfter).toBe(true);
  });

  it('maps common source extensions and detects markdown', () => {
    expect(codeLanguage('/repo/src/App.tsx')).toBe('tsx');
    expect(codeLanguage('/repo/data.json')).toBe('json');
    expect(codeLanguage('/repo/unknown.xyz')).toBe('text');
    expect(isMarkdownResource({ path: '/repo/README.md' } as never)).toBe(true);
  });
});
