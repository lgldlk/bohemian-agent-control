import { useEffect } from 'react';
import type { Editor } from 'tldraw';
import { collectDependentShapeIds } from './boardNodeGraph';

/** 删 agent / 终端后，把已经没两端的连接线一起清掉。 */
export function useBoardNodeCascade(editor: Editor | null) {
  useEffect(() => {
    if (!editor) return;
    let cascading = false;

    return editor.sideEffects.registerAfterDeleteHandler('shape', (shape) => {
      if (cascading) return;
      if (shape.type !== 'task-card' && shape.type !== 'terminal') return;
      const extra = collectDependentShapeIds(editor, shape);
      if (extra.length === 0) return;
      cascading = true;
      try {
        editor.deleteShapes(extra);
      } finally {
        cascading = false;
      }
    });
  }, [editor]);
}
