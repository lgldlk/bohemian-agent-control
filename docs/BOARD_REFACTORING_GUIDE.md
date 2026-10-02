# 白板组件重构指南

## 改动概述

本次重构解决了"会话更新时整个画板刷新"的性能问题，并建立了清晰的架构规范。

## 主要改动

### 1. 新增 `useBoardSync` Hook

**文件**：`src/board/useBoardSync.ts`

将所有白板数据同步逻辑从 `App.tsx` 和 `EvidenceBoard.tsx` 中抽离到独立的 hook。

**之前**：
```typescript
// 在 App.tsx 中有一个大的 useEffect
useEffect(() => {
  if (view !== 'board') return;
  const timer = setTimeout(() => {
    const editor = getBoardEditor();
    syncSpaceToBoard(editor, groups, tasksById);
    refreshTaskCardProps(editor, tasksById);
    // ... 更多同步逻辑
  }, 200);
  return () => clearTimeout(timer);
}, [groups, view, spaceIds, lastUpdate, mergedTasks.length]);
```

**之后**：
```typescript
// 在 App.tsx 中简洁地调用
useBoardSync({
  enabled: view === 'board',
  tasks: mergedTasks,
  groups,
  spaceIds,
  lastUpdate,
  dropPoint: dropPointRef.current,
});
```

### 2. 简化 `EvidenceBoard` 组件

**文件**：`src/board/EvidenceBoard.tsx`

**之前的问题**：
- 组件接收 `tasks` 和 `changedIds` 作为 props
- 但这些 props 在组件内部被 `void` 忽略（不使用）
- 每次这些 props 变化时，整个组件重新渲染，导致白板刷新

**改动**：
- 将 `tasks` 和 `changedIds` 改为可选参数（`tasks?: Task[]`, `changedIds?: string[]`）
- 组件内部不再使用这些 props
- 实际的数据同步由 `useBoardSync` hook 处理

**Props 变化**：
```typescript
// 之前
interface EvidenceBoardProps {
  tasks: Task[];              // 必需
  changedIds: string[];       // 必需
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}

// 之后
interface EvidenceBoardProps {
  tasks?: Task[];             // 可选，通常不使用
  changedIds?: string[];      // 可选，通常不使用
  terminalClient: TerminalClient;  // 新增
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}
```

### 3. App.tsx 中的改动

**导入新的 hook**：
```typescript
import { useBoardSync } from '@/board/useBoardSync';
```

**使用 hook 替代原有的 useEffect**：
```typescript
// 删除了原来的大 useEffect，改为
useBoardSync({
  enabled: view === 'board',
  tasks: mergedTasks,
  groups,
  spaceIds,
  lastUpdate,
  dropPoint: dropPointRef.current,
});
```

**EvidenceBoard 的调用保持不变**（向后兼容）：
```typescript
<EvidenceBoard
  tasks={mergedTasks}
  changedIds={changedIds}
  terminalClient={terminalClient}
  onOpenTerminal={openTerminalForTask}
  onDropNewTask={dropToBoard}
  onBlankDoubleClick={(x, y, groupId) => {
    dropPointRef.current = { x, y };
    openAddModal(groupId, 'start');
  }}
/>
```

## 性能提升

### 问题
每次 tasks 更新时（比如会话的消息数增加、状态变化等），`EvidenceBoard` 都会因为 props 变化而重新渲染，导致：
- 整个白板视觉上"刷新"
- 用户体验不流畅
- 性能开销大

### 解决方案
1. **数据同步与 UI 分离**：数据同步通过 `useBoardSync` 直接操作 tldraw editor API，不触发 React 重新渲染
2. **仅更新变化的卡片**：`refreshTaskCardProps` 函数只更新实际变化的卡片属性
3. **稳定的引用**：使用 `useRef` 保持回调函数引用稳定

### 效果
- ✅ 会话更新时，只有相应的卡片属性更新，白板不再整体刷新
- ✅ 用户可以平滑地拖拽、缩放、编辑白板
- ✅ 性能显著提升

## 架构优势

### 1. 职责清晰
- **useBoardSync**：数据同步逻辑
- **EvidenceBoard**：UI 渲染和用户交互
- **boardSync.ts**：空间归属和白板形状的同步
- **boardPlacement.ts / groupFrame.ts**：画板落位和分组框规则，分开存放

### 2. 易于维护
- 数据同步逻辑集中在一个 hook 中
- 新增同步逻辑时，只需修改 `useBoardSync.ts`
- 新增 UI 交互时，只需修改 `EvidenceBoard.tsx`

### 3. 易于测试
- 每个模块职责单一，便于单元测试
- 可以独立测试数据同步逻辑和 UI 交互

### 4. 可扩展
- 需要新的数据同步？在 `useBoardSync` 中添加 useEffect
- 需要新的白板操作？按文件单一职责放进 `boardSync.ts`、`boardPlacement.ts` 或 `groupFrame.ts`
- 需要新的用户交互？在 `EvidenceBoard` 中添加事件处理

## 向后兼容性

✅ 完全向后兼容：
- EvidenceBoard 的 props 接口保持兼容（只是将某些字段改为可选）
- 调用方式无需改动
- 现有功能全部保留

## 未来工作

基于这个架构，可以轻松添加：
- [ ] 白板的撤销/重做历史管理
- [ ] 卡片的批量操作
- [ ] 更丰富的分组功能
- [ ] 白板的协作编辑
- [ ] 白板视图的状态持久化优化

## 需要注意的点

1. **不要在 EvidenceBoard 中添加数据同步逻辑**
   - 如果需要同步数据，在 `useBoardSync` 中添加

2. **使用 useRef 保持回调函数稳定**
   - 在 EvidenceBoard 内部，使用 `useRef` 存储 props 中的回调函数
   - 这样即使回调函数的引用变化，也不会触发不必要的重新渲染

3. **批量更新白板**
   - 使用 `editor.updateShapes([...])` 一次性更新多个 shape
   - 避免在循环中多次调用更新

4. **使用防抖**
   - 对于频繁触发的同步操作，使用 `setTimeout` 防抖

## 相关文档

详细的架构说明请查看：[BOARD_ARCHITECTURE.md](./BOARD_ARCHITECTURE.md)

## 问题反馈

如果遇到任何问题或有改进建议，请：
1. 先查看 [BOARD_ARCHITECTURE.md](./BOARD_ARCHITECTURE.md)
2. 在团队群里讨论
3. 提交 Issue 或 PR
