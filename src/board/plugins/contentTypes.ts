import type { IndexKey, JsonObject, TLParentId, TLShapeId } from 'tldraw';

export const PLUGIN_CONTENT_SHAPE_TYPE = 'plugin-content' as const;

export interface PluginContentShapeProps {
  pluginId: string;
  componentType: string;
  data: string;
  w: number;
  h: number;
}

export type PluginContentShape = {
  id: TLShapeId;
  type: typeof PLUGIN_CONTENT_SHAPE_TYPE;
  typeName: 'shape';
  x: number;
  y: number;
  rotation: number;
  index: IndexKey;
  parentId: TLParentId;
  isLocked: boolean;
  opacity: number;
  props: PluginContentShapeProps;
  meta: JsonObject;
};
