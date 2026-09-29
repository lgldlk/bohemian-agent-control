import { lazy, Suspense, useCallback, useState } from 'react';
import {
  HTMLContainer,
  Rectangle2d,
  ShapeUtil,
  T,
  resizeBox,
  type IndexKey,
  type JsonObject,
  type TLParentId,
  type TLResizeInfo,
  type TLShapeId,
  useEditor,
  useValue,
} from 'tldraw';

import {
  ClipboardPaste,
  Copy,
  Eraser,
  MoreHorizontal,
  PanelBottom,
  PanelRight,
  RotateCw,
  Search,
  SquareTerminal,
  Type,
  X,
} from 'lucide-react';
import { TerminalAppearanceMenu } from '@bohemian/terminal-ui/appearance-menu';
import type { TerminalRuntimeState } from '@bohemian/terminal-ui/terminal';
import { getBoardTerminalLinkResolvers } from './plugins/resourceRuntime';
import { terminalResourceLinkCapabilities } from '@/resources/resourceApi';
const TerminalSurface = lazy(() => import('@bohemian/terminal-ui/terminal').then(({ Terminal }) => ({ default: Terminal })));
import { TERMINAL_DEFAULT_H, TERMINAL_DEFAULT_W, TERMINAL_SHAPE_TYPE } from './boardTerminals';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import { createResourceShape } from './resourceBoardOperations';
import { findTaskShape } from './boardShapes';
import { shouldAutoFocusAgentInput } from './agentInputFocus';
import { getBoardTerminalApi } from './terminalApi';
import { enterSelectedShapeEditAfterClick, handleExitedTerminalDoubleClick, handleShapeDoubleClick, IconButton, MenuRow, useTerminalShapeEvents } from './events';
import { BoardPluginTerminalOverlayHost } from './plugins/hosts/BoardPluginOverlayHost';
import type { BoardTerminalOverlayState } from './plugins/types';

export type TerminalShapeProps = {
  terminalId: string;
  nodeId: string;
  title: string;
  cwd: string;
  status: string;
  w: number;
  h: number;
};

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    terminal: TerminalShapeProps;
  }
}

export type TerminalShape = {
  id: TLShapeId;
  type: 'terminal';
  typeName: 'shape';
  x: number;
  y: number;
  rotation: number;
  index: IndexKey;
  parentId: TLParentId;
  isLocked: boolean;
  opacity: number;
  props: TerminalShapeProps;
  meta: JsonObject;
};

export class TerminalShapeUtil extends ShapeUtil<TerminalShape> {
  static override type = TERMINAL_SHAPE_TYPE;
  static override props = {
    terminalId: T.string,
    nodeId: T.string,
    title: T.string,
    cwd: T.string,
    status: T.string,
    w: T.number,
    h: T.number,
  };

  override canEdit() {
    return true;
  }

  override canResize() {
    return true;
  }

  override isAspectRatioLocked() {
    return false;
  }

  override hideRotateHandle() {
    return true;
  }

  override canBind() {
    return true;
  }

  override canScroll(shape: TerminalShape) {
    return this.editor.getEditingShapeId() === shape.id;
  }

  override onClick(shape: TerminalShape) {
    const terminal = getBoardTerminalApi()?.info(shape.props.terminalId);
    const taskShapeId = findTaskShape(this.editor, shape.props.nodeId);
    const taskShape = taskShapeId ? this.editor.getShape(taskShapeId) : undefined;
    const agentKind = terminal?.agentKind || (taskShape?.type === 'task-card'
      ? (taskShape.props as { agentKind?: string }).agentKind
      : undefined);
    if (!shouldAutoFocusAgentInput(agentKind, terminal?.status ?? shape.props.status)) return;
    enterSelectedShapeEditAfterClick(this.editor, shape.id);
  }

  override onDoubleClick(shape: TerminalShape) {
    handleShapeDoubleClick(this.editor, shape, () => {
      void getBoardTerminalApi()?.restart(shape.props.terminalId);
    });
  }

  override getDefaultProps(): TerminalShapeProps {
    return {
      terminalId: '',
      nodeId: '',
      title: 'Terminal',
      cwd: '',
      status: 'starting',
      w: TERMINAL_DEFAULT_W,
      h: TERMINAL_DEFAULT_H,
    };
  }

  override getGeometry(shape: TerminalShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: TerminalShape, info: TLResizeInfo<TerminalShape>) {
    return resizeBox(shape, info);
  }

  override component(shape: TerminalShape) {
    return <TerminalShapeBody shape={shape} />;
  }

  override getIndicatorPath(shape: TerminalShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, 10);
    return path;
  }
}

function TerminalShapeBody({ shape }: { shape: TerminalShape }) {
  const editor = useEditor();
  const onTerminalInputEvent = useCallback((event: Event) => {
    editor.markEventAsHandled(event);
  }, [editor]);
  const onResourceActivate = useCallback((resource: TerminalResourceRef) => {
    const bounds = editor.getShapePageBounds(shape.id);
    createResourceShape(editor, resource, bounds ? {
      x: bounds.x + bounds.w + 48,
      y: bounds.y,
    } : undefined);
  }, [editor, shape.id]);
  const [runtimeState, setRuntimeState] = useState<TerminalRuntimeState>({ phase: 'loading' });
  const cameraZoom = useValue('terminal camera zoom', () => editor.getZoomLevel(), [editor]);
  const {
    handleRef,
    editing,
    resolved,
    client,
    terminalInfo,
    taskRunning,
    agentStatus,
    boardStatus,
    blocked,
    missing,
    title,
    cwd,
    status,
    onFocus,
    onBarPointerDown,
    onBodyPointerDown,
    onBodyWheel,
    isolate,
    actions,
  } = useTerminalShapeEvents(shape, runtimeState.phase);
  const overlayState: BoardTerminalOverlayState = missing
    ? { phase: 'missing', taskStatus: boardStatus, message: 'Terminal session is no longer available' }
    : !client || !shape.props.terminalId
      ? { phase: 'connecting', taskStatus: boardStatus }
      : { ...runtimeState, taskStatus: boardStatus };

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: shape.props.h,
        borderRadius: 10,
        overflow: 'hidden',
        color: resolved.theme.foreground,
        background: resolved.theme.background,
      }}
    >
      <div className={`tl-terminal${taskRunning ? ' is-run' : ''}${editing ? ' is-edit' : ''}`} style={{ background: resolved.theme.background }}>
        <header className="tl-terminal__bar" onPointerDown={onBarPointerDown}>
          <SquareTerminal
            size={13}
            className={
              taskRunning
                ? 'text-emerald-400'
                : blocked
                  ? 'text-amber-400'
                  : boardStatus === 'idle' || boardStatus === 'starting'
                    ? 'text-zinc-300'
                    : 'text-zinc-500'
            }
          />
          <div className="tl-terminal__meta">
            <div className="tl-terminal__title" title={title}>{title}</div>
            <div className="tl-terminal__cwd" title={cwd}>{cwd}</div>
          </div>
          <IconButton label="Split right" onClick={actions.splitRight}>
            <PanelRight size={13} />
          </IconButton>
          <IconButton label="Split down" onClick={actions.splitDown}>
            <PanelBottom size={13} />
          </IconButton>
          <details className="relative">
            <summary className="tl-terminal__btn" title="Display" onPointerDown={isolate}>
              <Type size={13} />
            </summary>
            <div className="tl-terminal__menu" onPointerDown={isolate}>
              <TerminalAppearanceMenu />
            </div>
          </details>
          <details className="relative">
            <summary className="tl-terminal__btn" title="Terminal actions" onPointerDown={isolate}>
              <MoreHorizontal size={13} />
            </summary>
            <div className="tl-terminal__menu" onPointerDown={isolate}>
              <MenuRow label="Find" icon={<Search size={13} />} onClick={actions.find} />
              <MenuRow label="Copy" icon={<Copy size={13} />} onClick={actions.copy} />
              <MenuRow label="Paste" icon={<ClipboardPaste size={13} />} onClick={actions.paste} />
              <MenuRow label="Clear" icon={<Eraser size={13} />} onClick={actions.clear} />
              <MenuRow label="Restart" icon={<RotateCw size={13} />} onClick={actions.restart} />
            </div>
          </details>
          <IconButton label="Close terminal" danger onClick={actions.close}>
            <X size={13} />
          </IconButton>
        </header>
        <div
          className="tl-terminal__body"
          onPointerDown={onBodyPointerDown}
          onDoubleClickCapture={(event) => {
            handleExitedTerminalDoubleClick(event, status, overlayState.phase, actions.restart);
          }}
          onWheel={onBodyWheel}
        >
          {missing ? (
            <div className="tl-terminal__empty flex flex-col items-center justify-center gap-2 p-4 text-center">
              <span>Terminal session is no longer available</span>
              <button type="button" className="px-btn px-btn-dark px-2 py-1 text-[8px]" onClick={actions.recoverMissing}>
                Reconnect
              </button>
            </div>
          ) : client && shape.props.terminalId ? (
            <div className="tl-terminal__surface">
              <Suspense fallback={<div className="tl-terminal__empty">Loading terminal…</div>}>
                <TerminalSurface
                  ref={handleRef}
                  terminalId={shape.props.terminalId}
                  client={client}
                  active={editing}
                  parked={false}
                  gpu={true}
                  customGlyphs
                  terminalInfo={terminalInfo ?? undefined}
                  terminalLinkResolvers={getBoardTerminalLinkResolvers()}
                  terminalResourceCapabilities={terminalResourceLinkCapabilities}
                  cameraZoom={cameraZoom}
                  onResourceActivate={onResourceActivate}
                  onFocus={onFocus}
                  onInputEvent={onTerminalInputEvent}
                  onStatusChange={(state: TerminalRuntimeState) => setRuntimeState(state)}
                />
              </Suspense>
            </div>
          ) : (
            <div className="tl-terminal__empty">Connecting…</div>
          )}
          <BoardPluginTerminalOverlayHost
            terminalId={shape.props.terminalId}
            title={title}
            cwd={cwd}
            state={overlayState}
          />
        </div>
      </div>
    </HTMLContainer>
  );
}
