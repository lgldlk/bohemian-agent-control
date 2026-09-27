import { useEffect, useRef } from 'react';
import { getBoardEditor } from './EvidenceBoard';
import {
  bootstrapNamedFrames,
  forceBoardPaint,
  pruneOrphanShapes,
  refreshTaskCardProps,
  setBoardSpaceSyncReady,
  syncSpaceToBoard,
} from './boardSync';
import type { Task } from '@/types';
import type { GroupInput } from './boardSync';

export interface UseBoardSyncOptions {
  /** 是否启用同步（例如，只在 board 视图时启用） */
  enabled: boolean;
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
  tasks,
  groups,
  spaceIds,
  lastUpdate,
  dropPoint = { x: 120, y: 120 },
}: UseBoardSyncOptions) {
  // 使用 ref 保持最新值，避免在 effect 依赖中引入过多依赖
  const groupsRef = useRef(groups);
  groupsRef.current = groups;

  const tasksMapRef = useRef(new Map<string, Task>());
  tasksMapRef.current = new Map(tasks.map((t) => [t.id, t]));

  const dropPointRef = useRef(dropPoint);
  dropPointRef.current = dropPoint;

  useEffect(() => {
    if (!enabled) return;
    if (tasks.length === 0) return;

    // 延迟执行，确保 editor 已经挂载
    const timer = setTimeout(() => {
      const editor = getBoardEditor();
      if (!editor) return;

      const g = groupsRef.current;
      const map = tasksMapRef.current;
      const before = editor.getCurrentPageShapes().filter((s) => s.type === 'task-card').length;

      // 1. 同步白板：确保所有 space 中的任务都在白板上
      syncSpaceToBoard(editor, g, map, dropPointRef.current);

      // 2. 刷新卡片属性：更新已有卡片的数据
      refreshTaskCardProps(editor, map);

      // 3. 同步分组框架：为命名分组创建 frame
      bootstrapNamedFrames(editor, g);
      setBoardSpaceSyncReady(true);

      // 4. 清理孤儿卡片：删除不再属于任何分组的卡片
      pruneOrphanShapes(editor, new Set(spaceIds));

      const after = editor.getCurrentPageShapes().filter((s) => s.type === 'task-card').length;

      // 如果添加了新卡片，强制重绘以确保渲染
      if (after > before) {
        requestAnimationFrame(() => forceBoardPaint(editor));
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [enabled, groups, spaceIds, lastUpdate, tasks.length]);
}
