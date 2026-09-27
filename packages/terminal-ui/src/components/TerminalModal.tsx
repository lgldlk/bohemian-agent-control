import { useEffect, useRef, useState } from 'react';
import type { TerminalClient } from '@bohemian/terminal-client';
import { Terminal, type TerminalHandle } from './Terminal';

interface TerminalModalProps {
  terminalId: string;
  client: TerminalClient;
  nodeId?: string;
  title?: string;
  isOpen?: boolean;
  onClose: () => void;
}

/** Lightweight floating pane for callers that do not need a split workspace. */
export function TerminalModal({
  terminalId,
  client,
  nodeId,
  title,
  isOpen = true,
  onClose,
}: TerminalModalProps) {
  const handleRef = useRef<TerminalHandle>(null);
  const [position, setPosition] = useState({ x: 96, y: 96 });
  const [size, setSize] = useState({ width: 820, height: 520 });
  const [dragging, setDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!dragging) return;
    const move = (event: MouseEvent) => {
      setPosition({
        x: Math.max(8, event.clientX - dragOffset.current.x),
        y: Math.max(8, event.clientY - dragOffset.current.y),
      });
    };
    const up = () => setDragging(false);
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
    return () => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
    };
  }, [dragging]);

  useEffect(() => {
    handleRef.current?.fit();
  }, [size.width, size.height, isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed z-[160000] overflow-hidden border border-zinc-700 bg-zinc-950 shadow-2xl"
      style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
    >
      <div
        className="flex h-9 cursor-move items-center justify-between border-b border-zinc-800 bg-zinc-900 px-3"
        onMouseDown={(event) => {
          if ((event.target as HTMLElement).closest('button')) return;
          setDragging(true);
          dragOffset.current = { x: event.clientX - position.x, y: event.clientY - position.y };
        }}
      >
        <span className="truncate text-xs text-zinc-300">
          {title || `Terminal ${terminalId.slice(0, 8)}`}
          {nodeId ? ` · ${nodeId}` : ''}
        </span>
        <button type="button" onClick={onClose} className="px-2 text-zinc-500 hover:text-white" aria-label="Close">
          ×
        </button>
      </div>
      <div className="h-[calc(100%-36px)] min-h-0">
        <Terminal ref={handleRef} terminalId={terminalId} client={client} />
      </div>
      <div
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
        onMouseDown={(event) => {
          event.preventDefault();
          const start = { x: event.clientX, y: event.clientY, ...size };
          const move = (next: MouseEvent) => {
            setSize({
              width: Math.max(420, start.width + next.clientX - start.x),
              height: Math.max(260, start.height + next.clientY - start.y),
            });
          };
          const up = () => {
            document.removeEventListener('mousemove', move);
            document.removeEventListener('mouseup', up);
          };
          document.addEventListener('mousemove', move);
          document.addEventListener('mouseup', up);
        }}
      />
    </div>
  );
}
