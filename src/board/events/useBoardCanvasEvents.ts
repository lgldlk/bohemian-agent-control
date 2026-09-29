import { useEffect, useRef, useState } from 'react';
import type { Editor } from 'tldraw';
import { resolveBlankBoardDoubleClick } from '../boardDoubleClick';
import { groupIdAtPagePoint } from '../boardShapes';
import { setTaskTerminalHandler } from './boardNodeEvents';

const DROP_OFFSET_X = 150;
const DROP_OFFSET_Y = 75;

interface BoardCanvasEventHandlers {
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onDropFiles?: (
    editor: Editor,
    files: readonly File[],
    point: { x: number; y: number },
  ) => void | Promise<unknown>;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}

/** 画布级节点事件：任务卡打开终端、外部拖入落卡、空白处双击。 */
export function useBoardCanvasEvents({
  onOpenTerminal,
  onDropNewTask,
  onDropFiles,
  onBlankDoubleClick,
}: BoardCanvasEventHandlers) {
  const editorRef = useRef<Editor | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [fileDropState, setFileDropState] = useState<{
    phase: 'idle' | 'dragging' | 'importing';
    count: number;
  }>({ phase: 'idle', count: 0 });
  const onTerminalRef = useRef(onOpenTerminal);
  onTerminalRef.current = onOpenTerminal;
  const onDropRef = useRef(onDropNewTask);
  onDropRef.current = onDropNewTask;
  const onFilesRef = useRef(onDropFiles);
  onFilesRef.current = onDropFiles;
  const onBlankRef = useRef(onBlankDoubleClick);
  onBlankRef.current = onBlankDoubleClick;

  useEffect(() => {
    setTaskTerminalHandler((id) => onTerminalRef.current(id));
    return () => setTaskTerminalHandler(() => {});
  }, []);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const filesOf = (event: DragEvent): File[] => Array.from(event.dataTransfer?.files ?? []);
    const updateFileDropState = (phase: 'idle' | 'dragging' | 'importing', count: number) => {
      setFileDropState((current) => current.phase === phase && current.count === count
        ? current
        : { phase, count });
    };
    const isFileDrag = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).includes('Files');

    const onDragEnter = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      updateFileDropState('dragging', filesOf(event).length);
    };

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!isFileDrag(event)) return;
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
      updateFileDropState('dragging', filesOf(event).length);
    };

    const onDragLeave = (event: DragEvent) => {
      if (!isFileDrag(event)) return;
      event.stopPropagation();
      if (event.relatedTarget instanceof Node && el.contains(event.relatedTarget)) return;
      updateFileDropState('idle', 0);
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const editor = editorRef.current;
      if (!editor) return;
      const rect = el.getBoundingClientRect();
      const pt = editor.screenToPage({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      const taskId = event.dataTransfer?.getData('application/x-pi-task');
      if (taskId) {
        updateFileDropState('idle', 0);
        onDropRef.current(taskId, pt.x - DROP_OFFSET_X, pt.y - DROP_OFFSET_Y);
        return;
      }
      const files = filesOf(event);
      if (files.length === 0 || !onFilesRef.current) {
        updateFileDropState('idle', 0);
        return;
      }
      updateFileDropState('importing', files.length);
      void Promise.resolve(onFilesRef.current(editor, files, pt))
        .catch((error: unknown) => console.error('[board-resource-import] drop failed', error))
        .finally(() => updateFileDropState('idle', 0));
    };

    const onDblClick = (event: MouseEvent) => {
      const editor = editorRef.current;
      if (!editor) return;
      const pt = editor.screenToPage({ x: event.clientX, y: event.clientY });
      const hit = editor.getShapeAtPoint(pt, { hitInside: true });
      const target = resolveBlankBoardDoubleClick(
        hit,
        hit ? null : groupIdAtPagePoint(editor, pt),
      );
      if (!target) return;
      event.preventDefault();
      event.stopPropagation();
      onBlankRef.current?.(pt.x, pt.y, target.groupId);
    };

    el.addEventListener('dragenter', onDragEnter, true);
    el.addEventListener('dragover', onDragOver, true);
    el.addEventListener('dragleave', onDragLeave, true);
    el.addEventListener('drop', onDrop, true);
    el.addEventListener('dblclick', onDblClick);
    return () => {
      el.removeEventListener('dragenter', onDragEnter, true);
      el.removeEventListener('dragover', onDragOver, true);
      el.removeEventListener('dragleave', onDragLeave, true);
      el.removeEventListener('drop', onDrop, true);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, []);

  return { editorRef, dropRef, fileDropState };
}
