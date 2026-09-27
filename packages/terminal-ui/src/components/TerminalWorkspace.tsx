import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react';
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
  X,
} from 'lucide-react';
import type { TerminalClient } from '@bohemian/terminal-client';
import type { TerminalInfo } from '@bohemian/terminal-protocol';
import { Terminal, type TerminalHandle } from './Terminal';
import type { TerminalLayoutNode, TerminalSplitDirection } from '../layout';

export interface TerminalWorkspaceProps {
  client: TerminalClient;
  layout: TerminalLayoutNode;
  infos: ReadonlyMap<string, TerminalInfo>;
  activeTerminalId: string | null;
  onActivate: (terminalId: string) => void;
  onSplit: (terminalId: string, direction: TerminalSplitDirection) => void;
  onClose: (terminalId: string) => void;
  onRestart: (terminalId: string) => void;
  onRename: (terminalId: string, title: string) => void;
  onRatioChange: (splitId: string, ratio: number) => void;
}

export function TerminalWorkspace(props: TerminalWorkspaceProps) {
  const handles = useRef(new Map<string, TerminalHandle>());
  return (
    <div className="h-full min-h-0 w-full min-w-0 bg-zinc-950">
      <LayoutBranch {...props} node={props.layout} handles={handles.current} />
    </div>
  );
}

function LayoutBranch(
  props: TerminalWorkspaceProps & {
    node: TerminalLayoutNode;
    handles: Map<string, TerminalHandle>;
  },
) {
  const { node } = props;
  if (node.type === 'leaf') {
    return <TerminalPane {...props} terminalId={node.terminalId} />;
  }
  return <TerminalSplit {...props} node={node} />;
}

function TerminalSplit(
  props: TerminalWorkspaceProps & {
    node: Extract<TerminalLayoutNode, { type: 'split' }>;
    handles: Map<string, TerminalHandle>;
  },
) {
  const { node } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const horizontal = node.direction === 'horizontal';
  const beginResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    const move = (next: PointerEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const ratio = horizontal
        ? (next.clientX - rect.left) / rect.width
        : (next.clientY - rect.top) / rect.height;
      props.onRatioChange(node.id, ratio);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };

  return (
    <div ref={containerRef} className={`flex h-full min-h-0 w-full min-w-0 ${horizontal ? 'flex-row' : 'flex-col'}`}>
      <div className="min-h-0 min-w-0" style={{ flexBasis: `${node.ratio * 100}%`, flexGrow: 0, flexShrink: 0 }}>
        <LayoutBranch {...props} node={node.first} />
      </div>
      <div
        role="separator"
        aria-orientation={horizontal ? 'vertical' : 'horizontal'}
        title="Drag to resize panes"
        onPointerDown={beginResize}
        className={`group relative z-10 shrink-0 bg-zinc-800 hover:bg-zinc-500 ${horizontal ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}`}
      >
        <div className={`absolute bg-zinc-400 opacity-0 group-hover:opacity-100 ${horizontal ? '-left-1 inset-y-0 w-3' : '-top-1 inset-x-0 h-3'}`} />
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <LayoutBranch {...props} node={node.second} />
      </div>
    </div>
  );
}

function TerminalPane(
  props: TerminalWorkspaceProps & {
    terminalId: string;
    handles: Map<string, TerminalHandle>;
  },
) {
  const { terminalId, handles } = props;
  const info = props.infos.get(terminalId);
  const active = props.activeTerminalId === terminalId;
  const [renaming, setRenaming] = useState(false);
  const [draftTitle, setDraftTitle] = useState(info?.title ?? 'Terminal');

  const commitTitle = () => {
    const title = draftTitle.trim();
    if (title && title !== info?.title) props.onRename(terminalId, title);
    else setDraftTitle(info?.title ?? 'Terminal');
    setRenaming(false);
  };

  return (
    <section
      className={`flex h-full min-h-0 min-w-0 flex-col border ${active ? 'border-zinc-500' : 'border-zinc-900'}`}
      onPointerDown={() => props.onActivate(terminalId)}
    >
      <header className={`flex h-8 shrink-0 items-center gap-1 border-b px-1.5 ${active ? 'border-zinc-700 bg-zinc-800' : 'border-zinc-900 bg-zinc-900'}`}>
        <SquareTerminal size={13} className={info?.status === 'running' ? 'text-emerald-400' : 'text-zinc-600'} />
        {renaming ? (
          <input
            autoFocus
            value={draftTitle}
            onChange={(event) => setDraftTitle(event.target.value)}
            onBlur={commitTitle}
            onKeyDown={(event) => {
              if (event.key === 'Enter') commitTitle();
              if (event.key === 'Escape') {
                setDraftTitle(info?.title ?? 'Terminal');
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 bg-black px-1 text-xs text-white outline-none"
          />
        ) : (
          <button
            type="button"
            title="Double-click to rename"
            onDoubleClick={() => setRenaming(true)}
            className="min-w-0 flex-1 truncate text-left text-[11px] text-zinc-300"
          >
            {info?.title ?? terminalId}
          </button>
        )}
        <PaneButton label="Split right" onClick={() => props.onSplit(terminalId, 'horizontal')}><PanelRight size={13} /></PaneButton>
        <PaneButton label="Split down" onClick={() => props.onSplit(terminalId, 'vertical')}><PanelBottom size={13} /></PaneButton>
        <details className="relative">
          <summary className="flex h-6 w-6 cursor-pointer list-none items-center justify-center text-zinc-500 hover:bg-zinc-700 hover:text-white" title="Terminal actions">
            <MoreHorizontal size={14} />
          </summary>
          <div className="absolute right-0 top-7 z-50 w-44 border border-zinc-700 bg-zinc-950 p-1 shadow-2xl">
            <MenuButton label="Find" icon={<Search size={13} />} onClick={() => handles.get(terminalId)?.openSearch()} />
            <MenuButton label="Copy selection" icon={<Copy size={13} />} onClick={() => void handles.get(terminalId)?.copy()} />
            <MenuButton label="Paste" icon={<ClipboardPaste size={13} />} onClick={() => void handles.get(terminalId)?.paste()} />
            <MenuButton label="Select all" icon={<SquareTerminal size={13} />} onClick={() => handles.get(terminalId)?.selectAll()} />
            <MenuButton label="Clear scrollback" icon={<Eraser size={13} />} onClick={() => void handles.get(terminalId)?.clear()} />
            <MenuButton label="Restart process" icon={<RotateCw size={13} />} onClick={() => props.onRestart(terminalId)} />
          </div>
        </details>
        <PaneButton label="Close pane" onClick={() => props.onClose(terminalId)}><X size={13} /></PaneButton>
      </header>
      <div className="min-h-0 flex-1">
        <Terminal
          ref={(handle) => {
            if (handle) handles.set(terminalId, handle);
            else handles.delete(terminalId);
          }}
          terminalId={terminalId}
          client={props.client}
          active={active}
          onFocus={() => props.onActivate(terminalId)}
        />
      </div>
    </section>
  );
}

function PaneButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={(event) => { event.stopPropagation(); onClick(); }} className="flex h-6 w-6 shrink-0 items-center justify-center text-zinc-500 hover:bg-zinc-700 hover:text-white">
      {children}
    </button>
  );
}

function MenuButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white">
      {icon}<span>{label}</span>
    </button>
  );
}
