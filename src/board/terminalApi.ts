import type { TLShapeId } from 'tldraw';
import type { TerminalInfo } from '@bohemian/terminal-protocol';
import type { CanvasTerminalNode } from '@bohemian/terminal-canvas';

export interface BoardTerminalApi {
  openForNode(node: CanvasTerminalNode): Promise<string | null>;
  createFree(cwd?: string): Promise<string | null>;
  split(shapeId: TLShapeId, direction: 'horizontal' | 'vertical'): Promise<string | null>;
  recoverMissing(shapeId: TLShapeId): Promise<string | null>;
  closeShape(shapeId: TLShapeId): Promise<void>;
  restart(terminalId: string): Promise<void>;
  rename(terminalId: string, title: string): Promise<void>;
  info(terminalId: string): TerminalInfo | undefined;
  focusTerminal(terminalId: string): boolean;
}

let api: BoardTerminalApi | null = null;

export function setBoardTerminalApi(next: BoardTerminalApi | null): void {
  api = next;
}

export function getBoardTerminalApi(): BoardTerminalApi | null {
  return api;
}
