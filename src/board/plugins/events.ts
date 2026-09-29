import type { TLRecord, TLShapeId } from 'tldraw';

export type BoardPluginEvent =
  | { type: 'shape-created'; shapeIds: readonly TLShapeId[]; records: readonly TLRecord[] }
  | { type: 'shape-edited'; shapeIds: readonly TLShapeId[]; records: readonly TLRecord[] }
  | { type: 'shape-deleted'; shapeIds: readonly TLShapeId[] }
  | { type: 'selection-changed'; shapeIds: readonly TLShapeId[] }
  | { type: 'terminal-opened'; terminalId: string; taskId?: string }
  | { type: 'terminal-closed'; terminalId: string; taskId?: string }
  | { type: 'terminal-status-changed'; terminalId: string; status: string }
  | { type: 'arrange-completed'; scope: 'board' | 'group'; frameId?: TLShapeId };

export type BoardPluginEventListener = (event: BoardPluginEvent) => void;

export interface BoardPluginEventBus {
  subscribe(listener: BoardPluginEventListener): () => void;
  emit(event: BoardPluginEvent): void;
}

export function createBoardPluginEventBus(): BoardPluginEventBus {
  const listeners = new Set<BoardPluginEventListener>();
  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    emit(event) {
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch {
          // One plugin must not break delivery to the others.
        }
      }
    },
  };
}
