import { useState } from 'react';

export type View = 'board' | 'grid';
export type AddMode = 'pin' | 'start';

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

  const openAddModal = (groupId?: string, mode: AddMode = 'pin') => {
    setAddPresetGroup(groupId);
    setAddMode(mode);
    setAddModalOpen(true);
  };

  const closeAddModal = () => {
    setAddModalOpen(false);
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
    openAddModal,
    closeAddModal,
  };
}
