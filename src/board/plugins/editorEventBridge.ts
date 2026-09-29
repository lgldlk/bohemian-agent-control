import type { Editor, TLRecord, TLShapeId } from 'tldraw';
import type { BoardPluginEventBus } from './events';

export function attachBoardPluginEditorEvents(
  editor: Editor,
  events: BoardPluginEventBus,
): () => void {
  let lastSelectionKey = '';
  const emitSelection = () => {
    const shapeIds = editor.getSelectedShapeIds();
    const key = shapeIds.join('|');
    if (key === lastSelectionKey) return;
    lastSelectionKey = key;
    events.emit({ type: 'selection-changed', shapeIds });
  };
  const onCreatedShapes = (records: TLRecord[]) => {
    events.emit({
      type: 'shape-created',
      shapeIds: records.map((record) => record.id as TLShapeId),
      records,
    });
  };
  const onEditedShapes = (records: TLRecord[]) => {
    events.emit({
      type: 'shape-edited',
      shapeIds: records.map((record) => record.id as TLShapeId),
      records,
    });
  };
  const onDeletedShapes = (shapeIds: TLShapeId[]) => {
    events.emit({ type: 'shape-deleted', shapeIds });
  };

  editor.on('created-shapes', onCreatedShapes);
  editor.on('edited-shapes', onEditedShapes);
  editor.on('deleted-shapes', onDeletedShapes);
  editor.on('change', emitSelection);

  return () => {
    editor.off('change', emitSelection);
    editor.off('deleted-shapes', onDeletedShapes);
    editor.off('edited-shapes', onEditedShapes);
    editor.off('created-shapes', onCreatedShapes);
  };
}
