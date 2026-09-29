import { useState } from 'react';

export type View = 'board' | 'grid';
export type AddMode = 'pin' | 'start';
export interface BoardPoint { x: number; y: number; }

/**
 * 应用状态管理 Hook
 * 
 * 职责：
 * 1. 视图切换（board / grid）
 * 2. 搜索状态
 * 3. 添加会话模态框状态
 */
export function useAppState() {
  const [view, setView] = useState<View>('board');
  const [search, setSearch] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addPresetGroup, setAddPresetGroup] = useState<string | undefined>(undefined);
  const [addMode, setAddMode] = useState<AddMode>('pin');

  const [addPoint, setAddPoint] = useState<BoardPoint | undefined>();

  const openAddModal = (groupId?: string, mode: AddMode = 'pin', point?: BoardPoint) => {
    setAddPresetGroup(groupId);
    setAddMode(mode);
    setAddPoint(point);
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
    setAddPoint(undefined);
  };

  return {
    view,
    setView,
    search,
    setSearch,
    addModalOpen,
    setAddModalOpen,
    addPresetGroup,
    addMode,
    addPoint,
    openAddModal,
    closeAddModal,
  };
}
