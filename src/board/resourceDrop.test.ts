import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from 'tldraw';
import { registerBoardPlugin, resetBoardPluginRegistryForTests } from './plugins/registry';
import { importDroppedFilesToBoard } from './resourceDrop';

function editorStub() {
  const createShape = vi.fn();
  const setSelectedShapes = vi.fn();
  const zoomToSelection = vi.fn();
  return {
    editor: {
      getViewportPageBounds: () => ({ x: 0, y: 0, w: 1000, h: 800 }),
      getCurrentPageShapes: () => [],
      createShape,
      setSelectedShapes,
      zoomToSelection,
      select: vi.fn(),
    } as unknown as Editor,
    createShape,
    setSelectedShapes,
    zoomToSelection,
  };
}

afterEach(() => {
  resetBoardPluginRegistryForTests();
  vi.unstubAllGlobals();
});

describe('importDroppedFilesToBoard', () => {
  it('uploads accepted files concurrently and creates board resource shapes', async () => {
    registerBoardPlugin({
      id: 'drop-files', version: '1.0.0', titleKey: 'drop-files',
      resources: {
        resourceImporters: [{
          id: 'drop-importer',
          canImport: () => true,
          createResource: (imported) => ({
            kind: 'local-file',
            raw: imported.name,
            path: imported.path,
            displayText: imported.name,
            cwd: imported.cwd,
            line: null,
            column: null,
            previewKind: imported.previewKind,
            mimeType: imported.mimeType,
          }),
        }],
      },
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = new URL(String(input), 'http://localhost');
      const name = url.searchParams.get('name') ?? 'file.bin';
      return new Response(JSON.stringify({
        name,
        path: `/managed/${name}`,
        cwd: '/managed',
        size: 10,
        mimeType: name.endsWith('.png') ? 'image/png' : 'text/plain',
        previewKind: name.endsWith('.png') ? 'image' : 'text',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));
    const files = [
      new File(['hello'], 'notes.txt', { type: 'text/plain' }),
      new File(['image'], 'preview.png', { type: 'image/png' }),
    ];
    const { editor, createShape, setSelectedShapes } = editorStub();

    const result = await importDroppedFilesToBoard(editor, files, { x: 500, y: 300 });

    expect(result.failedFiles).toEqual([]);
    expect(result.rejectedFiles).toEqual([]);
    expect(result.importedShapeIds).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(createShape).toHaveBeenCalledTimes(2);
    expect(setSelectedShapes).toHaveBeenCalledWith(result.importedShapeIds);
  });

  it('reports files that no plugin importer accepts', async () => {
    const file = new File(['unknown'], 'unknown.bin');
    const { editor, createShape } = editorStub();
    const result = await importDroppedFilesToBoard(editor, [file], { x: 0, y: 0 });
    expect(result.rejectedFiles).toEqual(['unknown.bin']);
    expect(createShape).not.toHaveBeenCalled();
  });
});
