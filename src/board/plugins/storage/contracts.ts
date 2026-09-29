import type { TLParentId, TLShapeId } from 'tldraw';
import type { PluginContentShape } from '../contentTypes';

export type PluginJsonValue =
  | null
  | boolean
  | number
  | string
  | PluginJsonValue[]
  | { [key: string]: PluginJsonValue };

export interface PluginDataCodec<T> {
  encode(value: T): PluginJsonValue;
  decode(value: unknown): T | null;
}

export interface BoardPluginSettingsStorage {
  get<T>(key: string, decode: (value: unknown) => T | null, fallback: T): T;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
}

export interface PluginContentCreateInput<T> {
  pluginId: string;
  componentType: string;
  x: number;
  y: number;
  data: T;
  codec: PluginDataCodec<T>;
  w?: number;
  h?: number;
  parentId?: TLParentId;
}

export interface PluginContentRecord<T> {
  shapeId: TLShapeId;
  pluginId: string;
  componentType: string;
  data: T;
}

export interface BoardPluginContentStorage {
  create<T>(input: Omit<PluginContentCreateInput<T>, 'pluginId'>): TLShapeId | null;
  read<T>(shapeId: TLShapeId, codec: PluginDataCodec<T>): PluginContentRecord<T> | null;
  update<T>(shapeId: TLShapeId, data: T, codec: PluginDataCodec<T>): boolean;
  remove(shapeId: TLShapeId): boolean;
  list(): PluginContentShape[];
}
