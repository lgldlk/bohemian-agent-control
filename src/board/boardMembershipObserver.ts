import type { Editor, TLShapeId } from 'tldraw';
import { isBusinessGroupFrame } from './boardShapes';
import { UNGROUPED_ID, type BoardCardRef } from './boardMembership';
import { publishBoardMembership } from './boardMembershipStore';

/** Canvas-side adapter. Imported only by lazy BoardWorkspace, not the app shell. */
export function readBoardCards(editor: Editor): BoardCardRef[] {
  const cards: BoardCardRef[] = [];
  for (const shape of editor.getCurrentPageShapes()) {
    if (shape.type !== 'task-card') continue;
    const taskId = String((shape.props as { taskId?: string }).taskId ?? '');
    if (!taskId) continue;
    const parent = shape.parentId ? editor.getShape(shape.parentId as TLShapeId) : undefined;
    const frame = parent && isBusinessGroupFrame(parent) ? parent : undefined;
    cards.push({
      taskId,
      groupId: frame ? String((frame.meta as { groupId?: string }).groupId ?? UNGROUPED_ID) : UNGROUPED_ID,
      groupName: frame ? String((frame.props as { name?: string }).name ?? '') : '',
    });
  }
  return cards;
}

/** Keep the shared lightweight projection current while tldraw is mounted. */
export function observeBoardMembership(editor: Editor): () => void {
  const sync = () => publishBoardMembership(readBoardCards(editor));
  sync();
  const stopDocument = editor.store.listen(sync, { scope: 'document' });
  const stopSession = editor.store.listen(sync, { scope: 'session' });
  return () => {
    stopDocument();
    stopSession();
  };
}
