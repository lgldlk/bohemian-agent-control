import { useEffect, useMemo, useRef } from 'react';
import { ExternalLink, RefreshCw } from 'lucide-react';
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  createShapePropsMigrationIds,
  createShapePropsMigrationSequence,
  resizeBox,
  type IndexKey,
  type JsonObject,
  type TLParentId,
  type TLResizeInfo,
  type TLShapeId,
  useEditor,
} from 'tldraw';
import { refreshResource } from '@/resources/resourceRefresh';
import { getBoardResourceActionCapabilities } from '@/resources/resourceActions';
import { emitResourceActivated } from '@/resources/resourceBus';
import { resourcePreviewUrl, useResourceDocument } from '@/resources/useResourceDocument';
import { findBoardResourceRenderer, getBoardResourceActions } from './plugins/resourceRuntime';
import type { BoardResourceDocument } from './plugins/resourceTypes';
import { BoardPluginErrorBoundary } from './plugins/BoardPluginErrorBoundary';
import { consumePendingResourceFocus } from './resourceFocus';
import { defaultResourceShapeSize, shouldExpandLegacyResourceShape } from './resourceLayout';
import { useResourceActivationPolicy } from './resourceActivationStore';
import { attachResourceInteractionBoundary } from './resourceInteractionBoundary';
import { useBoardNodeEvents } from './events/useBoardNodeEvents';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';

export const RESOURCE_SHAPE_TYPE = 'resource' as const;

export type ResourceShapeProps = {
  resourceKind: 'local-file' | 'local-directory' | 'remote-url';
  displayName: string;
  path: string;
  url: string;
  displayUrl: string;
  sensitive: boolean;
  cwd: string;
  previewKind: string;
  mimeType: string;
  terminalId: string;
  agentKind: string;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
  w: number;
  h: number;
};

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    resource: ResourceShapeProps;
  }
}

export type ResourceShape = {
  id: TLShapeId;
  type: 'resource';
  typeName: 'shape';
  x: number;
  y: number;
  rotation: number;
  index: IndexKey;
  parentId: TLParentId;
  isLocked: boolean;
  opacity: number;
  props: ResourceShapeProps;
  meta: JsonObject;
};

const resourceShapeVersions = createShapePropsMigrationIds(RESOURCE_SHAPE_TYPE, {
  AddRemoteUrl: 1,
  AddLineRange: 2,
  AddRemoteDisplayUrl: 3,
  ExpandDefaultPreview: 4,
});

export class ResourceShapeUtil extends ShapeUtil<ResourceShape> {
  static override type = RESOURCE_SHAPE_TYPE;
  static override props = {
    resourceKind: T.string,
    displayName: T.string,
    path: T.string,
    url: T.string,
    displayUrl: T.string,
    sensitive: T.boolean,
    cwd: T.string,
    previewKind: T.string,
    mimeType: T.string,
    terminalId: T.string,
    agentKind: T.string,
    line: T.number,
    column: T.number,
    endLine: T.number,
    endColumn: T.number,
    w: T.number,
    h: T.number,
  };
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: resourceShapeVersions.AddRemoteUrl,
        up: (props) => ({ ...props, url: props.url ?? '', sensitive: props.sensitive ?? false }),
        down: ({ url, sensitive: _sensitive, ...props }) => ({
          ...props,
          path: props.path || url || '',
        }),
      },
      {
        id: resourceShapeVersions.AddLineRange,
        up: (props) => ({ ...props, endLine: props.endLine ?? 0, endColumn: props.endColumn ?? 0 }),
        down: ({ endLine: _endLine, endColumn: _endColumn, ...props }) => props,
      },
      {
        id: resourceShapeVersions.AddRemoteDisplayUrl,
        up: (props) => ({ ...props, displayUrl: props.displayUrl ?? props.url ?? '' }),
        down: ({ displayUrl: _displayUrl, ...props }) => props,
      },
      {
        id: resourceShapeVersions.ExpandDefaultPreview,
        up: (props) => {
          const input = {
            kind: props.resourceKind,
            previewKind: props.previewKind,
            w: props.w,
            h: props.h,
          };
          return shouldExpandLegacyResourceShape(input)
            ? { ...props, ...defaultResourceShapeSize(input) }
            : props;
        },
        down: (props) => props,
      },
    ],
  });

  override canResize() {
    return true;
  }

  override canEdit() {
    return true;
  }

  override hideRotateHandle() {
    return true;
  }

  override getDefaultProps(): ResourceShapeProps {
    return {
      resourceKind: 'local-file',
      displayName: 'Resource',
      path: '',
      url: '',
      displayUrl: '',
      sensitive: false,
      cwd: '',
      previewKind: 'binary',
      mimeType: '',
      terminalId: '',
      agentKind: '',
      line: 0,
      column: 0,
      endLine: 0,
      endColumn: 0,
      w: 900,
      h: 620,
    };
  }

  override getGeometry(shape: ResourceShape) {
    return new Rectangle2d({ width: shape.props.w, height: shape.props.h, isFilled: true });
  }

  override onResize(shape: ResourceShape, info: TLResizeInfo<ResourceShape>) {
    return resizeBox(shape, info);
  }

  override onDoubleClick(shape: ResourceShape) {
    emitResourceActivated(resourceFromShape(shape));
  }

  override component(shape: ResourceShape) {
    return <ResourceShapeBody shape={shape} />;
  }

  override getIndicatorPath(shape: ResourceShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 8);
    return path;
  }
}

function resourceFromShape(shape: ResourceShape): TerminalResourceRef {
  return {
    kind: shape.props.resourceKind,
    raw: shape.props.resourceKind === 'remote-url' ? shape.props.url : shape.props.path,
    path: shape.props.path || undefined,
    url: shape.props.url || undefined,
    persistentUrl: shape.props.displayUrl || shape.props.url || undefined,
    sensitive: shape.props.sensitive,
    displayText: shape.props.displayName,
    cwd: shape.props.cwd,
    line: shape.props.line || null,
    column: shape.props.column || null,
    endLine: shape.props.endLine || null,
    endColumn: shape.props.endColumn || null,
    terminalId: shape.props.terminalId || undefined,
    agentKind: shape.props.agentKind || undefined,
    previewKind: shape.props.previewKind || undefined,
    mimeType: shape.props.mimeType || undefined,
  };
}

function ResourceShapeBody({ shape }: { shape: ResourceShape }) {
  const editor = useEditor();
  const { props } = shape;
  const {
    editing,
    onActivate,
    onChromePointerDown,
  } = useBoardNodeEvents(shape.id, { editable: true });
  const contentRef = useRef<HTMLDivElement>(null);
  const resourcePolicy = useResourceActivationPolicy(editor);
  const resource = useMemo(() => resourceFromShape(shape), [
    props.resourceKind,
    props.path,
    props.url,
    props.displayUrl,
    props.sensitive,
    props.displayName,
    props.cwd,
    props.line,
    props.column,
    props.endLine,
    props.endColumn,
    props.previewKind,
    props.mimeType,
    props.terminalId,
    props.agentKind,
  ]);
  const isResourceDeferred = (
    !resourcePolicy.initialized && resourcePolicy.smartEnabled
  ) || resourcePolicy.deferredIds.has(shape.id);
  const state = useResourceDocument(resource, isResourceDeferred);
  const document = state.status === 'ready' ? state.document : undefined;
  const renderer = document ? findBoardResourceRenderer(document) : null;
  const Renderer = renderer?.Component;
  const previewUrl = resourcePreviewUrl(document?.resource ?? resource);
  const actionDocument: BoardResourceDocument = document ?? {
    resource,
    previewKind: props.previewKind,
    name: props.displayName,
  };
  const resourceActions = useMemo(
    () => getBoardResourceActions(resource, actionDocument),
    [actionDocument, resource],
  );
  const openAction = resourceActions.find((action) => action.id === 'open-local' || action.id === 'open-external');
  const actionCapabilities = useMemo(() => getBoardResourceActionCapabilities(), []);
  const previewKind = document?.previewKind ?? props.previewKind;

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;
    return attachResourceInteractionBoundary(content, onActivate);
  }, [onActivate]);

  useEffect(() => {
    if (state.status === 'loading' || !consumePendingResourceFocus(shape.id)) return;
    editor.select(shape.id);
    editor.setEditingShape(shape.id);
    const frame = requestAnimationFrame(() => {
      editor.zoomToSelection({ animation: { duration: 240 } });
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, shape.id, state.status]);

  return (
    <HTMLContainer style={{ width: props.w, height: props.h, overflow: 'hidden', pointerEvents: 'all' }}>
      <div className={`flex h-full flex-col overflow-hidden border bg-zinc-950 text-zinc-200 shadow-xl ${editing ? 'border-zinc-500' : 'border-zinc-700'}`}>
        <div className="flex min-h-9 cursor-move items-center gap-2 border-b border-zinc-800 px-3" onPointerDown={onChromePointerDown}>
          <span className="min-w-0 flex-1 truncate text-xs font-medium" title={props.displayUrl || props.path}>{props.displayName}</span>
          {props.line > 0 && (
            <span className="shrink-0 font-mono text-[9px] text-amber-300">
              L{props.line}{props.endLine > props.line ? `–${props.endLine}` : ''}
            </span>
          )}
          <span className="text-[10px] uppercase text-zinc-500">{previewKind}</span>
          <button
            type="button"
            title="Refresh resource preview"
            aria-label="Refresh resource preview"
            className="grid h-6 w-6 shrink-0 place-items-center text-zinc-500 hover:bg-zinc-800 hover:text-white"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              refreshResource(resource);
            }}
          >
            <RefreshCw size={12} />
          </button>
          {openAction && (
            <button
              type="button"
              title={openAction.labelKey}
              aria-label={openAction.labelKey}
              className="grid h-6 w-6 shrink-0 place-items-center text-zinc-500 hover:bg-zinc-800 hover:text-white"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                void openAction.run(resource, actionDocument, actionCapabilities);
              }}
            >
              <ExternalLink size={12} />
            </button>
          )}
        </div>
        <div
          ref={contentRef}
          tabIndex={-1}
          className="min-h-0 flex-1 select-text overflow-hidden bg-zinc-900/70 outline-none"
          style={{ touchAction: 'pan-x pan-y', overscrollBehavior: 'contain' }}
        >
          {state.status === 'loading' && (
            <div className="flex h-full items-center justify-center text-[11px] text-zinc-500">Loading resource…</div>
          )}
          {state.status === 'error' && (
            <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-red-300">{state.error}</div>
          )}
          {state.status === 'deferred' && (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center text-[11px] text-zinc-500">
              <div className="text-zinc-300">Smart resource loading</div>
              <div>This preview activates when the node enters the readable viewport.</div>
            </div>
          )}
          {document && Renderer && (
            <BoardPluginErrorBoundary pluginId={`resource-renderer:${renderer?.id ?? 'unknown'}`}>
              <Renderer document={document} previewUrl={previewUrl} surface="board" />
            </BoardPluginErrorBoundary>
          )}
          {document && !Renderer && (
            <div className="flex h-full items-center justify-center p-3 text-center text-[11px] text-zinc-400">No renderer is available for this resource.</div>
          )}
        </div>
      </div>
    </HTMLContainer>
  );
}
