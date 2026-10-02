import { useEffect, useRef } from 'react';
import type { TLShapeId } from 'tldraw';
import { createRafScheduler } from '@/lib/timing';
import { focusPendingTaskShape, getBoardEditor, subscribeBoardEditor } from './boardEditor';
import {
  bootstrapNamedFrames,
  forceBoardPaint,
  refreshTaskCardProps,
  syncSpaceToBoard,
} from './boardSync';
import { setBoardSpaceSyncReady } from './boardSyncState';
import { findTaskShape, isBusinessGroupFrame } from './boardShapes';
import { arrangeGroupFrame } from './boardArrangeEditor';
import type { Task } from '@/types';
import type { GroupInput } from './boardSync';

export interface UseBoardSyncOptions {
  /** 是否启用同步（例如，只在 board 视图时启用） */
  enabled: boolean;
  /** Active board. Only this board's projection may be synced or pruned. */
  boardId?: string;
  /** 任务列表 */
  tasks: Task[];
  /** 分组信息 */
  groups: GroupInput[];
  /** 任务 ID 列表（用于检测变化） */
  spaceIds: string[];
  /** 最后更新时间 */
  lastUpdate: Date | null;
  /** 落卡的默认位置 */
  dropPoint?: { x: number; y: number };
}

/**
 * 白板数据同步 Hook
 * 
 * 职责：
 * 1. 监听 tasks 变化，自动更新白板上的卡片属性
 * 2. 监听 groups 变化，自动同步分组框架
 * 3. 清理不再属于任何分组的卡片
 * 
 * 使用场景：
 * - 在 App.tsx 中调用，统一管理白板数据同步
 * - 避免在 EvidenceBoard 组件中处理数据同步，保持组件纯粹性
 */
export function useBoardSync({
  enabled,
  boardId,
  tasks,
  groups,
  spaceIds,
  lastUpdate,
  dropPoint = { x: 120, y: 120 },
}: UseBoardSyncOptions) {
  // 使用 ref 保持最新值，避免在 effect 依赖中引入过多依赖
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const boardRef = useRef(boardId);
  boardRef.current = boardId;

  const tasksMapRef = useRef(new Map<string, Task>());
  tasksMapRef.current = new Map(tasks.map((t) => [t.id, t]));

  const dropPointRef = useRef(dropPoint);
  dropPointRef.current = dropPoint;

  useEffect(() => {
    if (!enabled || tasks.length === 0) return;
    const sync = () => {
      const editor = getBoardEditor();
      if (!editor) return;
      // A board switch changes the current page. Never sync or prune a board
      // that is no longer the one the projection belongs to.
      const board = boardRef.current;
      if (board && editor.getCurrentPageId() !== board) return;

      const g = groupsRef.current;
      const map = tasksMapRef.current;
      const before = editor.getCurrentPageShapes().filter((s) => s.type === 'task-card').length;
      const { createdTaskIds } = syncSpaceToBoard(editor, g, map, dropPointRef.current);
      refreshTaskCardProps(editor, map);
      bootstrapNamedFrames(editor, g);

      const affectedFrames = new Set<TLShapeId>();
      for (const taskId of createdTaskIds) {
        const cardId = findTaskShape(editor, taskId);
        const card = cardId ? editor.getShape(cardId) : undefined;
        const parent = card && card.parentId.startsWith('shape:')
          ? editor.getShape(card.parentId as TLShapeId)
          : undefined;
        if (parent && isBusinessGroupFrame(parent)) affectedFrames.add(parent.id);
      }
      for (const frameId of affectedFrames) {
        arrangeGroupFrame(editor, frameId, {
          preserveUnmanagedContent: true,
          recordHistory: false,
          emitEvent: false,
        });
      }

      // The canvas is the board source of truth. Never prune task cards from a
      // membership list: an empty/late store must not erase the user's board.
      setBoardSpaceSyncReady(true);
      focusPendingTaskShape(editor);

      const after = editor.getCurrentPageShapes().filter((s) => s.type === 'task-card').length;
      if (after > before) requestAnimationFrame(() => forceBoardPaint(editor));
    };
    const scheduler = createRafScheduler(sync);
    scheduler.schedule();
    const unsubscribe = subscribeBoardEditor(scheduler.schedule);
    return () => {
      unsubscribe();
      scheduler.cancel();
    };
  }, [boardId, enabled, groups, spaceIds, lastUpdate, tasks.length]);
}
