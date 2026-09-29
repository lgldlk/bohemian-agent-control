import type { Editor, TLShapeId } from 'tldraw';
import type { Task } from '@/types';
import { focusTaskShape as focusTaskShapeOnEditor } from '@/board/boardSync';
import type { BoardPluginEventBus } from './events';
import { createBoardPluginSettingsStorage, createPluginContentStorage } from './storage';
import type { BoardPlugin, BoardPluginContext } from './types';

export function createBoardPluginContext(
  plugin: BoardPlugin,
  editor: Editor,
  tasksRef: { current: readonly Task[] },
  events: BoardPluginEventBus,
): BoardPluginContext {
  return {
    pluginId: plugin.id,
    get tasks() {
      return tasksRef.current;
    },
    editor: {
      getShape: (id: TLShapeId) => {
        const shape = editor.getShape(id);
        if (!shape) return undefined;
        return {
          id: shape.id,
          type: shape.type,
          x: shape.x,
          y: shape.y,
          parentId: shape.parentId,
          props: { ...shape.props },
        };
      },
      getSelectedShapeIds: () => editor.getSelectedShapeIds(),
      focusShape: (id) => {
        editor.setSelectedShapes([id]);
        editor.zoomToSelection({ animation: { duration: 180 } });
      },
      focusTask: (taskId) => focusTaskShapeOnEditor(editor, taskId),
    },
    contentStorage: createPluginContentStorage(editor, plugin.id),
    settingsStorage: createBoardPluginSettingsStorage(plugin.id),
    events: { subscribe: events.subscribe },
    notify: {
      info: (message) => console.info(`[board-plugin:${plugin.id}] ${message}`),
      error: (message) => console.error(`[board-plugin:${plugin.id}] ${message}`),
    },
  };
}
