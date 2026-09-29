import { createShapeId, type Editor, type TLShapeId } from 'tldraw';
import { PLUGIN_CONTENT_SHAPE_TYPE, type PluginContentShape } from '../contentTypes';
import { findBoardPluginContent } from '../registry';
import type {
  BoardPluginContentStorage,
  PluginContentCreateInput,
  PluginContentRecord,
  PluginDataCodec,
} from './contracts';

function validGeometry(
  input: Pick<PluginContentCreateInput<unknown>, 'x' | 'y' | 'w' | 'h'>,
): boolean {
  return Number.isFinite(input.x)
    && Number.isFinite(input.y)
    && (input.w === undefined || (Number.isFinite(input.w) && input.w > 0))
    && (input.h === undefined || (Number.isFinite(input.h) && input.h > 0));
}

function encodeData<T>(value: T, codec: PluginDataCodec<T>): string | null {
  try {
    const serialized = JSON.stringify(codec.encode(value));
    return typeof serialized === 'string' ? serialized : null;
  } catch {
    return null;
  }
}

function decodeData<T>(serialized: unknown, codec: PluginDataCodec<T>): T | null {
  if (typeof serialized !== 'string') return null;
  try {
    const decoded = codec.decode(JSON.parse(serialized));
    return decoded == null ? null : decoded;
  } catch {
    return null;
  }
}

export function readPluginContent<T>(
  shape: PluginContentShape,
  codec: PluginDataCodec<T>,
): PluginContentRecord<T> | null {
  const data = decodeData(shape.props.data, codec);
  if (data === null) return null;
  return {
    shapeId: shape.id,
    pluginId: shape.props.pluginId,
    componentType: shape.props.componentType,
    data,
  };
}

export function createPluginContent<T>(
  editor: Editor,
  input: PluginContentCreateInput<T>,
): TLShapeId | null {
  if (
    !input.pluginId.trim()
    || !input.componentType.trim()
    || !findBoardPluginContent(input.pluginId, input.componentType)
    || !validGeometry(input)
  ) {
    return null;
  }
  const data = encodeData(input.data, input.codec);
  if (data === null) return null;
  const id = createShapeId();
  editor.createShapes([{
    id,
    type: PLUGIN_CONTENT_SHAPE_TYPE,
    x: input.x,
    y: input.y,
    ...(input.parentId ? { parentId: input.parentId } : {}),
    props: {
      pluginId: input.pluginId,
      componentType: input.componentType,
      data,
      w: input.w ?? 360,
      h: input.h ?? 220,
    },
  }]);
  return id;
}

export function updatePluginContent<T>(
  editor: Editor,
  shapeId: TLShapeId,
  data: T,
  codec: PluginDataCodec<T>,
): boolean {
  const shape = editor.getShape(shapeId);
  if (!shape || shape.type !== PLUGIN_CONTENT_SHAPE_TYPE) return false;
  const serialized = encodeData(data, codec);
  if (serialized === null) return false;
  editor.updateShape({
    id: shapeId,
    type: PLUGIN_CONTENT_SHAPE_TYPE,
    props: { data: serialized },
  });
  return true;
}

export function deletePluginContent(editor: Editor, shapeId: TLShapeId): boolean {
  const shape = editor.getShape(shapeId);
  if (!shape || shape.type !== PLUGIN_CONTENT_SHAPE_TYPE) return false;
  editor.deleteShapes([shapeId]);
  return true;
}

export function listPluginContent(editor: Editor, pluginId: string): PluginContentShape[] {
  return editor.getCurrentPageShapes().filter((shape): shape is PluginContentShape =>
    shape.type === PLUGIN_CONTENT_SHAPE_TYPE && shape.props.pluginId === pluginId,
  );
}

/** Host-owned content service. All mutations enter tldraw history and persistence. */
export function createPluginContentStorage(
  editor: Editor,
  pluginId: string,
): BoardPluginContentStorage {
  return {
    create<T>(input: Omit<PluginContentCreateInput<T>, 'pluginId'>): TLShapeId | null {
      if (!findBoardPluginContent(pluginId, input.componentType) || !validGeometry(input)) {
        return null;
      }
      return createPluginContent(editor, { ...input, pluginId });
    },
    read<T>(shapeId: TLShapeId, codec: PluginDataCodec<T>): PluginContentRecord<T> | null {
      const shape = editor.getShape(shapeId);
      if (
        !shape
        || shape.type !== PLUGIN_CONTENT_SHAPE_TYPE
        || shape.props.pluginId !== pluginId
      ) {
        return null;
      }
      return readPluginContent(shape, codec);
    },
    update<T>(shapeId: TLShapeId, data: T, codec: PluginDataCodec<T>): boolean {
      const shape = editor.getShape(shapeId);
      if (
        !shape
        || shape.type !== PLUGIN_CONTENT_SHAPE_TYPE
        || shape.props.pluginId !== pluginId
      ) {
        return false;
      }
      return updatePluginContent(editor, shapeId, data, codec);
    },
    remove(shapeId: TLShapeId): boolean {
      const shape = editor.getShape(shapeId);
      if (
        !shape
        || shape.type !== PLUGIN_CONTENT_SHAPE_TYPE
        || shape.props.pluginId !== pluginId
      ) {
        return false;
      }
      return deletePluginContent(editor, shapeId);
    },
    list(): PluginContentShape[] {
      return listPluginContent(editor, pluginId);
    },
  };
}
