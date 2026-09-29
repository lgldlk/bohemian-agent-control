import { describe, expect, it, vi } from 'vitest';
import type { Editor } from 'tldraw';
import { createResourceShape } from './resourceBoardOperations';
import { consumePendingResourceFocus } from './resourceFocus';

function fakeEditor(existing: unknown[] = []) {
  const createShape = vi.fn();
  const select = vi.fn();
  const updateShape = vi.fn();
  const zoomToSelection = vi.fn();
  return {
    editor: {
      getViewportPageBounds: () => ({ x: 0, y: 0, w: 1000, h: 800 }),
      getCurrentPageShapes: () => existing,
      createShape,
      updateShape,
      select,
      zoomToSelection,
    } as unknown as Editor,
    createShape,
    updateShape,
    select,
    zoomToSelection,
  };
}

describe('createResourceShape', () => {
  it('keeps the complete URL usable and visible', () => {
    const { editor, createShape } = fakeEditor();
    createResourceShape(editor, {
      kind: 'remote-url',
      raw: 'https://example.com/callback?token=secret',
      url: 'https://example.com/callback?token=secret',
      sensitive: true,
      displayText: 'https://example.com/callback?token=secret',
      cwd: '/repo',
      line: null,
      column: null,
    });

    const props = createShape.mock.calls[0]?.[0]?.props;
    expect(props.url).toContain('token=secret');
    expect(props.displayUrl).toContain('token=secret');
    expect(props.displayName).toBe('example.com');
    expect(props.resourceKind).toBe('remote-url');
    expect(props.sensitive).toBe(true);
  });

  it('uses host-provided coordinates and requests focus after rendering', () => {
    const { editor, createShape } = fakeEditor();
    const shapeId = createResourceShape(editor, {
      kind: 'local-file',
      raw: 'src/App.tsx',
      path: '/repo/src/App.tsx',
      displayText: 'src/App.tsx',
      cwd: '/repo',
      line: 10,
      column: 2,
    }, { x: 640, y: 120 });

    expect(createShape.mock.calls[0]?.[0]).toMatchObject({ x: 640, y: 120 });
    expect(consumePendingResourceFocus(shapeId)).toBe(true);
    expect(consumePendingResourceFocus(shapeId)).toBe(false);
  });

  it('updates an existing file shape when a new line range is referenced', () => {
    const existing = {
      id: 'shape:file',
      type: 'resource',
      props: {
        resourceKind: 'local-file', path: '/repo/src/App.tsx', line: 0, column: 0, endLine: 0, endColumn: 0,
      },
    };
    const { editor, createShape, updateShape } = fakeEditor([existing]);
    const result = createResourceShape(editor, {
      kind: 'local-file',
      raw: 'src/App.tsx:1-15',
      path: '/repo/src/App.tsx',
      displayText: 'src/App.tsx:1-15',
      cwd: '/repo',
      line: 1,
      column: null,
      endLine: 15,
      endColumn: null,
    });

    expect(result).toBe(existing.id);
    expect(createShape).not.toHaveBeenCalled();
    expect(updateShape).toHaveBeenCalledWith(expect.objectContaining({
      id: existing.id,
      props: expect.objectContaining({ line: 1, column: 0, endLine: 15, endColumn: 0 }),
    }));
    expect(consumePendingResourceFocus(existing.id as never)).toBe(true);
  });

  it('focuses an existing remote resource instead of duplicating it', () => {
    const existing = {
      id: 'shape:existing',
      type: 'resource',
      props: {
        resourceKind: 'remote-url',
        url: 'https://example.com/',
        displayUrl: 'https://example.com/',
        sensitive: false,
        line: 0,
        column: 0,
        endLine: 0,
        endColumn: 0,
        w: 1100,
        h: 720,
      },
    };
    const { editor, createShape, select, zoomToSelection } = fakeEditor([existing]);
    const result = createResourceShape(editor, {
      kind: 'remote-url',
      raw: 'example.com',
      url: 'https://example.com/',
      persistentUrl: 'https://example.com/',
      displayText: 'example.com',
      cwd: '/repo',
      line: null,
      column: null,
    });

    expect(result).toBe(existing.id);
    expect(createShape).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledWith(existing.id);
    expect(zoomToSelection).toHaveBeenCalledOnce();
  });
});
