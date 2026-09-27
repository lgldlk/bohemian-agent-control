import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
import {
  Maximize2,
  Minimize2,
  Minus,
  PanelRight,
  RotateCw,
  Square,
  SquareTerminal,
  X,
} from 'lucide-react';
import type { TerminalClient } from '@bohemian/terminal-client';
import type { TerminalInfo } from '@bohemian/terminal-protocol';
import {
  TerminalWorkspace,
  type TerminalLayoutNode,
  type TerminalSplitDirection,
} from '@bohemian/terminal-ui';

export interface CanvasTerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasTerminalWindowState {
  id: string;
  nodeId?: string;
  title: string;
  cwd: string;
  layout: TerminalLayoutNode;
  activeTerminalId: string;
  bounds: CanvasTerminalBounds;
  restoreBounds?: CanvasTerminalBounds;
  minimized: boolean;
  maximized: boolean;
  zIndex: number;
}

interface CanvasTerminalWindowProps {
  window: CanvasTerminalWindowState;
  client: TerminalClient;
  infos: ReadonlyMap<string, TerminalInfo>;
  onFocus: () => void;
  onChange: (patch: Partial<CanvasTerminalWindowState>) => void;
  onSplit: (terminalId: string, direction: TerminalSplitDirection) => void;
  onClosePane: (terminalId: string) => void;
  onRestartPane: (terminalId: string) => void;
  onRenamePane: (terminalId: string, title: string) => void;
  onRatioChange: (splitId: string, ratio: number) => void;
  onCloseWindow: () => void;
}

const MIN_WIDTH = 460;
const MIN_HEIGHT = 280;

export function CanvasTerminalWindow({
  window: terminalWindow,
  client,
  infos,
  onFocus,
  onChange,
  onSplit,
  onClosePane,
  onRestartPane,
  onRenamePane,
  onRatioChange,
  onCloseWindow,
}: CanvasTerminalWindowProps) {
  const dragRef = useRef<{ x: number; y: number; bounds: CanvasTerminalBounds } | null>(null);
  if (terminalWindow.minimized) return null;

  const startDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (terminalWindow.maximized || (event.target as HTMLElement).closest('button,input,details')) return;
    onFocus();
    dragRef.current = { x: event.clientX, y: event.clientY, bounds: terminalWindow.bounds };
    const move = (next: PointerEvent) => {
      const start = dragRef.current;
      if (!start) return;
      const width = start.bounds.width;
      const height = start.bounds.height;
      onChange({ bounds: clampBounds({
        ...start.bounds,
        x: start.bounds.x + next.clientX - start.x,
        y: start.bounds.y + next.clientY - start.y,
        width,
        height,
      }) });
    };
    const stop = () => {
      dragRef.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (terminalWindow.maximized) return;
    event.preventDefault();
    event.stopPropagation();
    onFocus();
    const start = { x: event.clientX, y: event.clientY, bounds: terminalWindow.bounds };
    const move = (next: PointerEvent) => {
      onChange({ bounds: clampBounds({
        ...start.bounds,
        width: Math.max(MIN_WIDTH, start.bounds.width + next.clientX - start.x),
        height: Math.max(MIN_HEIGHT, start.bounds.height + next.clientY - start.y),
      }) });
    };
    const stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop, { once: true });
  };

  const toggleMaximize = () => {
    if (terminalWindow.maximized) {
      onChange({
        maximized: false,
        bounds: terminalWindow.restoreBounds ?? defaultBounds(),
        restoreBounds: undefined,
      });
    } else {
      onChange({
        maximized: true,
        restoreBounds: terminalWindow.bounds,
        bounds: maximizedBounds(),
      });
    }
  };

  const style = terminalWindow.maximized
    ? { left: 8, top: 8, right: 8, bottom: 42, zIndex: terminalWindow.zIndex }
    : {
        left: terminalWindow.bounds.x,
        top: terminalWindow.bounds.y,
        width: terminalWindow.bounds.width,
        height: terminalWindow.bounds.height,
        zIndex: terminalWindow.zIndex,
      };

  return (
    <div
      className="fixed flex min-h-0 min-w-0 flex-col overflow-hidden border border-zinc-700 bg-zinc-950 shadow-[0_24px_80px_rgba(0,0,0,0.65)]"
      style={style}
      onPointerDown={onFocus}
      role="dialog"
      aria-label={terminalWindow.title}
    >
      <div
        className="flex h-10 shrink-0 cursor-move items-center gap-2 border-b border-zinc-700 bg-zinc-900 px-2"
        onPointerDown={startDrag}
        onDoubleClick={toggleMaximize}
      >
        <SquareTerminal size={15} className="shrink-0 text-zinc-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-zinc-100">{terminalWindow.title}</div>
          <div className="truncate text-[10px] text-zinc-500">{terminalWindow.cwd}</div>
        </div>
        <WindowButton label="Split active pane right" onClick={() => onSplit(terminalWindow.activeTerminalId, 'horizontal')}>
          <PanelRight size={14} />
        </WindowButton>
        <WindowButton label="Restart active process" onClick={() => onRestartPane(terminalWindow.activeTerminalId)}>
          <RotateCw size={14} />
        </WindowButton>
        <WindowButton label="Minimize" onClick={() => onChange({ minimized: true })}>
          <Minus size={14} />
        </WindowButton>
        <WindowButton label={terminalWindow.maximized ? 'Restore' : 'Maximize'} onClick={toggleMaximize}>
          {terminalWindow.maximized ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </WindowButton>
        <WindowButton label="Close terminal window" onClick={onCloseWindow} danger>
          <X size={14} />
        </WindowButton>
      </div>
      <div className="min-h-0 flex-1">
        <TerminalWorkspace
          client={client}
          layout={terminalWindow.layout}
          infos={infos}
          activeTerminalId={terminalWindow.activeTerminalId}
          onActivate={(activeTerminalId) => onChange({ activeTerminalId })}
          onSplit={onSplit}
          onClose={onClosePane}
          onRestart={onRestartPane}
          onRename={onRenamePane}
          onRatioChange={onRatioChange}
        />
      </div>
      {!terminalWindow.maximized && (
        <div
          className="absolute bottom-0 right-0 flex h-5 w-5 cursor-nwse-resize items-end justify-end text-zinc-600 hover:text-zinc-300"
          onPointerDown={startResize}
          title="Resize terminal window"
        >
          <Square size={9} />
        </div>
      )}
    </div>
  );
}

function WindowButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center ${danger ? 'text-zinc-500 hover:bg-red-950 hover:text-red-300' : 'text-zinc-500 hover:bg-zinc-700 hover:text-white'}`}
    >
      {children}
    </button>
  );
}

export function defaultBounds(offset = 0): CanvasTerminalBounds {
  const width = Math.min(920, Math.max(MIN_WIDTH, window.innerWidth - 160));
  const height = Math.min(600, Math.max(MIN_HEIGHT, window.innerHeight - 180));
  return clampBounds({ x: 80 + offset, y: 72 + offset, width, height });
}

function maximizedBounds(): CanvasTerminalBounds {
  return { x: 8, y: 8, width: window.innerWidth - 16, height: window.innerHeight - 50 };
}

function clampBounds(bounds: CanvasTerminalBounds): CanvasTerminalBounds {
  const width = Math.min(Math.max(MIN_WIDTH, bounds.width), Math.max(MIN_WIDTH, window.innerWidth - 16));
  const height = Math.min(Math.max(MIN_HEIGHT, bounds.height), Math.max(MIN_HEIGHT, window.innerHeight - 50));
  return {
    width,
    height,
    x: Math.min(Math.max(8 - width + 120, bounds.x), window.innerWidth - 120),
    y: Math.min(Math.max(8, bounds.y), window.innerHeight - 72),
  };
}
