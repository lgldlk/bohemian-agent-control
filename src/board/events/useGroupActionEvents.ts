import { useCallback } from 'react';
import { useEditor, useValue } from 'tldraw';
import { createGroupFromSelection, ungroupSelection } from '../groupFrameEditor';
import { useBoardNodeEvents } from './useBoardNodeEvents';
import { isBusinessGroupFrame } from '../boardShapes';

/** 编组条事件：父级 isolate + 编组/解组。 */
export function useGroupActionEvents() {
  const editor = useEditor();
  const node = useBoardNodeEvents(null, { chromeSelector: 'button' });
  const cards = useValue(
    'selected-task-cards',
    () => editor.getSelectedShapes().filter((shape) => shape.type === 'task-card'),
    [editor],
  );
  const frames = useValue(
    'selected-frames',
    () => editor.getSelectedShapes().filter((shape) => isBusinessGroupFrame(shape)),
    [editor],
  );

  const canGroup = cards.length >= 1;
  const canUngroup =
    frames.length > 0 || cards.some((card) => {
      const parent = editor.getShape(card.parentId);
      return Boolean(parent && isBusinessGroupFrame(parent));
    });
  const visible = (canGroup || canUngroup) && (cards.length > 0 || frames.length > 0);

  const group = useCallback(() => {
    createGroupFromSelection(editor);
  }, [editor]);

  const ungroup = useCallback(() => {
    ungroupSelection(editor);
  }, [editor]);

  return { ...node, visible, canGroup, canUngroup, group, ungroup };
}
