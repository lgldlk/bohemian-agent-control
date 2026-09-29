import { HTMLContainer, Rectangle2d, ShapeUtil, T, resizeBox, useEditor, type TLResizeInfo, type TLShapeId } from 'tldraw';
import type { BoardPluginContentStorage } from './storage';
import { createPluginContentStorage } from './storage';
import { BoardPluginErrorBoundary } from './BoardPluginErrorBoundary';
import { findBoardPluginContent } from './registry';
import { PLUGIN_CONTENT_SHAPE_TYPE, type PluginContentShape, type PluginContentShapeProps } from './contentTypes';
import type { BoardPluginContentContribution } from './types';

export interface PluginContentRendererProps {
  shapeId: TLShapeId;
  data: unknown;
  contentStorage: BoardPluginContentStorage;
}

declare module 'tldraw' {
  interface TLGlobalShapePropsMap {
    'plugin-content': PluginContentShapeProps;
  }
}

function parseData(value: string): { ok: true; data: unknown } | { ok: false } {
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch {
    return { ok: false };
  }
}

export class PluginContentShapeUtil extends ShapeUtil<PluginContentShape> {
  static override type = PLUGIN_CONTENT_SHAPE_TYPE;
  static override props = {
    pluginId: T.string,
    componentType: T.string,
    data: T.string,
    w: T.number,
    h: T.number,
  };

  override getDefaultProps(): PluginContentShapeProps {
    return {
      pluginId: '',
      componentType: '',
      data: 'null',
      w: 360,
      h: 220,
    };
  }

  override canResize() {
    return true;
  }

  override canEdit() {
    return false;
  }

  override hideRotateHandle() {
    return true;
  }

  override getGeometry(shape: PluginContentShape) {
    return new Rectangle2d({ width: safeDimension(shape.props.w, 360), height: safeDimension(shape.props.h, 220), isFilled: true });
  }

  override onResize(shape: PluginContentShape, info: TLResizeInfo<PluginContentShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: PluginContentShape) {
    const contribution = findBoardPluginContent(shape.props.pluginId, shape.props.componentType);
    if (!contribution) return <UnknownPluginContent shape={shape} />;
    return <PluginContentBody shape={shape} contribution={contribution} />;
  }

  override getIndicatorPath(shape: PluginContentShape) {
    const path = new Path2D();
    path.roundRect(0, 0, safeDimension(shape.props.w, 360), safeDimension(shape.props.h, 220), 8);
    return path;
  }
}

function safeDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function PluginContentBody({
  shape,
  contribution,
}: {
  shape: PluginContentShape;
  contribution: BoardPluginContentContribution;
}) {
  const editor = useEditor();
  const contentStorage = createPluginContentStorage(editor, shape.props.pluginId);
  const parsed = parseData(shape.props.data);
  if (!parsed.ok) return <UnknownPluginContent shape={shape} reason="Corrupt plugin data" />;

  let data = parsed.data;
  if (contribution.codec) {
    try {
      data = contribution.codec.decode(parsed.data);
    } catch {
      data = null;
    }
    if (data === null) return <UnknownPluginContent shape={shape} reason="Corrupt plugin data" />;
  }

  const Component = contribution.Component;
  return (
    <BoardPluginErrorBoundary pluginId={shape.props.pluginId}>
      <HTMLContainer className="h-full w-full overflow-hidden">
        <Component shapeId={shape.id} data={data} contentStorage={contentStorage} />
      </HTMLContainer>
    </BoardPluginErrorBoundary>
  );
}

function UnknownPluginContent({ shape, reason = 'Plugin content unavailable' }: { shape: PluginContentShape; reason?: string }) {
  return (
    <HTMLContainer className="flex h-full w-full flex-col justify-center border border-dashed border-zinc-700 bg-zinc-950 p-4 text-zinc-500">
      <strong className="text-xs">{reason}</strong>
      <span className="mt-1 text-[11px]">{shape.props.pluginId}/{shape.props.componentType}</span>
    </HTMLContainer>
  );
}
