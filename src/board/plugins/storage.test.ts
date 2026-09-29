import { describe, expect, it } from 'vitest';
import type { Editor } from 'tldraw';
import { registerBoardPlugin, resetBoardPluginRegistryForTests } from './registry';
import { createPluginContentStorage, readPluginContent, type PluginDataCodec } from './storage';
import type { PluginContentShape } from './PluginContentShape';

const codec: PluginDataCodec<{ title: string }> = {
  encode: (value) => value,
  decode: (value) => {
    if (!value || typeof value !== 'object' || !('title' in value) || typeof value.title !== 'string') return null;
    return { title: value.title };
  },
};

function shape(data: string): PluginContentShape {
  return {
    id: 'shape:plugin-content' as PluginContentShape['id'],
    type: 'plugin-content',
    typeName: 'shape',
    x: 0,
    y: 0,
    rotation: 0,
    index: 'a1' as PluginContentShape['index'],
    parentId: 'page:page' as PluginContentShape['parentId'],
    isLocked: false,
    opacity: 1,
    props: { pluginId: 'example', componentType: 'note', data, w: 360, h: 220 },
    meta: {},
  };
}

describe('plugin content storage contract', () => {
  it('decodes plugin-owned data from the persisted shape payload', () => {
    expect(readPluginContent(shape('{"title":"hello"}'), codec)?.data.title).toBe('hello');
  });

  it('only creates declared content with valid geometry', () => {
    resetBoardPluginRegistryForTests();
    registerBoardPlugin({
      id: 'example',
      version: '1.0.0',
      titleKey: 'usage.title',
      content: [{ componentType: 'note', Component: () => null }],
    });
    const created: unknown[] = [];
    const editor = {
      createShapes: (shapes: unknown[]) => created.push(...shapes),
    } as unknown as Editor;
    const storage = createPluginContentStorage(editor, 'example');

    expect(storage.create({ componentType: 'note', x: 10, y: 20, data: { title: 'ok' }, codec })).toBeTruthy();
    expect(storage.create({ componentType: 'missing', x: 10, y: 20, data: { title: 'bad' }, codec })).toBeNull();
    expect(storage.create({ componentType: 'note', x: 10, y: 20, w: 0, data: { title: 'bad' }, codec })).toBeNull();
    expect(created).toHaveLength(1);
  });

  it('rejects malformed or incompatible data', () => {
    expect(readPluginContent(shape('{bad'), codec)).toBeNull();
    expect(readPluginContent(shape('{"title":3}'), codec)).toBeNull();
  });
});

