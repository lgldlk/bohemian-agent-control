import { useEffect, useRef } from 'react';
import type { Editor } from 'tldraw';
import { groupIdOfFrame } from '../boardSync';
import { setTaskTerminalHandler } from './boardNodeEvents';

const DROP_OFFSET_X = 150;
const DROP_OFFSET_Y = 75;

interface BoardCanvasEventHandlers {
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}

/** 画布级节点事件：任务卡打开终端、外部拖入落卡、空白处双击。 */
export function useBoardCanvasEvents({
  onOpenTerminal,
  onDropNewTask,
  onBlankDoubleClick,
}: BoardCanvasEventHandlers) {
  const editorRef = useRef<Editor | null>(null);
  const dropRef = useRef<HTMLDivElement | null>(null);
  const onTerminalRef = useRef(onOpenTerminal);
  onTerminalRef.current = onOpenTerminal;
  const onDropRef = useRef(onDropNewTask);
  onDropRef.current = onDropNewTask;
  const onBlankRef = useRef(onBlankDoubleClick);
  onBlankRef.current = onBlankDoubleClick;

  useEffect(() => {
    setTaskTerminalHandler((id) => onTerminalRef.current(id));
    return () => setTaskTerminalHandler(() => {});
  }, []);

  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;

    const onDragOver = (event: DragEvent) => {
      event.preventDefault();
    };

    const onDrop = (event: DragEvent) => {
      event.preventDefault();
      const taskId = event.dataTransfer?.getData('application/x-pi-task');
      if (!taskId) return;
      const editor = editorRef.current;
      if (!editor) return;
      const rect = el.getBoundingClientRect();
      const pt = editor.screenToPage({
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      });
      onDropRef.current(taskId, pt.x - DROP_OFFSET_X, pt.y - DROP_OFFSET_Y);
    };

    const onDblClick = (event: MouseEvent) => {
      const editor = editorRef.current;
      if (!editor) return;
      const pt = editor.screenToPage({ x: event.clientX, y: event.clientY });
      const hit = editor.getShapeAtPoint(pt, { hitInside: true });
      if (hit?.type === 'task-card') return;
      let groupId: string | undefined;
      if (hit?.type === 'frame') {
        groupId = groupIdOfFrame(hit) ?? undefined;
      } else if (hit) {
        const parent = editor.getShape(hit.parentId);
        if (parent?.type === 'frame') groupId = groupIdOfFrame(parent) ?? undefined;
      }
      if (hit && !groupId) return;
      event.preventDefault();
      event.stopPropagation();
      onBlankRef.current?.(pt.x, pt.y, groupId);
    };

    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
    el.addEventListener('dblclick', onDblClick);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
      el.removeEventListener('dblclick', onDblClick);
    };
  }, []);

  return { editorRef, dropRef };
}
