# 白板架构文档

## 概述

本文档描述了证据板（Evidence Board）的数据流和组件职责划分，确保在添加新功能时不会出现性能问题。

## 架构原则

### 1. 职责分离

- **EvidenceBoard 组件**：只负责渲染白板 UI 和处理用户交互（拖拽、点击、双击等）
- **useBoardSync Hook**：负责所有的数据同步逻辑（tasks 更新、分组同步、卡片创建等）
- **App.tsx**：负责全局状态管理和组件编排

### 2. 数据流

```
useTasks() → mergedTasks
                ↓
        useBoardSync() → 直接操作 tldraw editor API
                ↓
        EvidenceBoard (仅渲染，不处理数据同步)
```

### 3. 为什么这样设计

**问题背景**：
- 早期版本中，`EvidenceBoard` 接收 `tasks` 和 `changedIds` 作为 props
- 虽然这些 props 在组件内部被 `void` 忽略（不使用）
- 但每次 `tasks` 变化时，React 会因为 props 变化而重新渲染整个 `EvidenceBoard`
- 这导致整个白板刷新，影响用户体验

**解决方案**：
- 将数据同步逻辑从 `EvidenceBoard` 中抽离到 `useBoardSync` hook
- `EvidenceBoard` 的 props 标记为可选（`tasks?: Task[]`, `changedIds?: string[]`）
- 数据同步通过直接操作 tldraw 的 editor API 完成，不触发 React 重新渲染
- 使用 `useRef` 保持回调函数的稳定引用，避免因回调函数变化导致重新渲染

## 核心模块

### 1. useBoardSync Hook

**位置**：`src/board/useBoardSync.ts`

**职责**：
- 监听 tasks 变化，自动更新白板上的卡片属性
- 监听 groups 变化，自动同步分组框架
- 清理不再属于任何分组的卡片

**参数**：
```typescript
interface UseBoardSyncOptions {
  enabled: boolean;        // 是否启用同步（例如，只在 board 视图时启用）
  tasks: Task[];          // 任务列表
  groups: GroupInput[];   // 分组信息
  spaceIds: string[];     // 任务 ID 列表（用于检测变化）
  lastUpdate: Date | null;// 最后更新时间
  dropPoint?: { x: number; y: number }; // 落卡的默认位置
}
```

**使用方式**：
```typescript
// 在 App.tsx 中
useBoardSync({
  enabled: view === 'board',
  tasks: mergedTasks,
  groups,
  spaceIds,
  lastUpdate,
  dropPoint: dropPointRef.current,
});
```

### 2. EvidenceBoard 组件

**位置**：`src/board/EvidenceBoard.tsx`

**职责**：
- 渲染 tldraw 白板
- 处理用户交互（拖拽落卡、双击空白处、打开终端等）
- 管理白板的 UI 状态（网格、分组操作栏等）

**Props**：
```typescript
interface EvidenceBoardProps {
  tasks?: Task[];         // 可选：用于某些特殊场景，但通常不使用
  changedIds?: string[];  // 可选：用于某些特殊场景，但通常不使用
  terminalClient: TerminalClient;  // 终端客户端
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}
```

**重要**：
- `tasks` 和 `changedIds` 是可选的，组件内部不依赖这些 props
- 所有回调函数通过 `useRef` 处理，确保引用稳定

### 3. boardSync.ts

**位置**：`src/board/boardSync.ts`

**职责**：把空间归属同步成白板上的卡片和分组框。不决定画板落位，也不决定分组框如何长大。

- `syncSpaceToBoard`: 同步空间任务到白板
- `refreshTaskCardProps`: 刷新卡片属性
- `bootstrapNamedFrames`: 创建分组框架
- `pruneOrphanShapes`: 清理孤立的卡片
- `readGroupsFromBoard`: 只从业务分组 frame 读取分组信息

#### 业务分组与原生 frame 的边界

- **业务分组 frame**：必须带有 `meta.groupId`，参与 `spaceStore`、组内 Agent 归属、业务整理、自动扩框和编组/解组。
- **原生 tldraw frame**：没有 `meta.groupId`，属于自由画板内容，不得写入 `spaceStore`，也不得触发业务分组创建、业务整理或自动扩框。
- 原生 frame 内的 Agent 在空间归属上视为未分组，但“整理整个画板”不会把它强行拖出原生 frame。
- 历史上由原生 frame 误生成的 `shape:*` 空间分组会在加载时清理；其中的 Agent 回收到“未分组”。

### 4. 画板落位与分组框

按文件单一职责拆开，调用方自己组合：

- `boardPlacement.ts`：画板上新形状的页面落位。纯规则。
- `groupFrame.ts`：分组框的内边距、单步上限，以及能不能收进新内容。纯规则。
- `groupFrameEditor.ts`：把分组框规则应用到 tldraw，不改落位算法。

## 添加新功能的最佳实践

### 1. 添加新的数据同步逻辑

**应该做**：在 `useBoardSync` hook 中添加新的 useEffect

```typescript
// 在 useBoardSync.ts 中
useEffect(() => {
  if (!enabled) return;
  const editor = getBoardEditor();
  if (!editor) return;
  
  // 你的同步逻辑
  someNewSyncFunction(editor, newData);
}, [enabled, newData]);
```

**不应该做**：在 EvidenceBoard 组件中处理数据同步

### 2. 添加新的用户交互

**应该做**：在 EvidenceBoard 组件中添加事件处理

```typescript
// 在 EvidenceBoard.tsx 中
const onNewInteraction = (e: MouseEvent) => {
  const editor = editorRef.current;
  if (!editor) return;
  
  // 处理用户交互
  // 如果需要通知父组件，调用 props 中的回调函数
  onNewAction?.(...);
};
```

### 3. 添加新的白板操作 API

**应该做**：按变化原因放进对应文件。空间与白板的同步放 `boardSync.ts`；画板落位放 `boardPlacement.ts`；分组框几何放 `groupFrame.ts`，应用到 editor 放 `groupFrameEditor.ts`。

```typescript
// 在职责对应的文件中
export function newBoardOperation(editor: Editor, params: SomeParams) {
  editor.updateShapes([...]);
}
```

然后在 `useBoardSync` 或其他地方调用。

## 性能优化要点

### 1. 避免不必要的重新渲染

- ✅ 使用 `useRef` 保持回调函数引用稳定
- ✅ 数据同步通过直接操作 editor API，而不是通过 React props
- ✅ 使用 `useMemo` 计算衍生状态
- ❌ 不要在 EvidenceBoard 中使用会频繁变化的 props

### 2. 批量更新

```typescript
// ✅ 好的做法：批量更新
editor.updateShapes([
  { id: shape1.id, type: 'task-card', props: newProps1 },
  { id: shape2.id, type: 'task-card', props: newProps2 },
]);

// ❌ 不好的做法：逐个更新
editor.updateShapes([{ id: shape1.id, type: 'task-card', props: newProps1 }]);
editor.updateShapes([{ id: shape2.id, type: 'task-card', props: newProps2 }]);
```

### 3. 防抖和延迟

对于频繁的更新操作，使用 setTimeout 延迟执行：

```typescript
useEffect(() => {
  const timer = setTimeout(() => {
    // 执行同步操作
  }, 200);
  return () => clearTimeout(timer);
}, [dependencies]);
```

## 调试技巧

### 1. 查看白板 editor 实例

```javascript
// 在浏览器控制台中
window.__boardEditor
```

### 2. 查看当前所有 shapes

```javascript
window.__boardEditor?.getCurrentPageShapes()
```

### 3. 查看某个任务的卡片

```javascript
import { findTaskShape } from '@/board/boardSync';
const shapeId = findTaskShape(window.__boardEditor, 'task-id-here');
const shape = window.__boardEditor?.getShape(shapeId);
```

## 常见问题

### Q: 为什么 EvidenceBoard 还有 tasks 和 changedIds props？

A: 这些 props 是可选的（`tasks?: Task[]`），保留它们是为了：
1. 向后兼容
2. 某些特殊场景可能需要访问这些数据
3. 但通常情况下，组件内部不使用这些 props

实际的数据同步由 `useBoardSync` hook 处理。

### Q: 如何确保白板数据和 React 状态同步？

A: 白板有自己的状态管理（通过 tldraw 的 store），我们通过两种方式保持同步：

1. **React → 白板**：通过 `useBoardSync` hook 中的 useEffect 监听 React 状态变化，调用 boardSync.ts 中的函数更新白板
2. **白板 → React**：在 EvidenceBoard 的 onMount 中设置监听器，当白板的分组结构变化时更新 spaceStore

### Q: 为什么不用 React.memo 优化 EvidenceBoard？

A: 因为：
1. 现在 `tasks` 和 `changedIds` 是可选的，组件不依赖它们
2. 回调函数通过 `useRef` 处理，引用稳定
3. 数据同步不通过 props，所以组件本身不需要频繁重新渲染
4. Tldraw 内部有自己的优化机制

## 总结

这个架构的核心思想是：

1. **数据同步和 UI 渲染分离**：数据同步在 useBoardSync hook 中处理，UI 渲染在 EvidenceBoard 组件中处理
2. **直接操作 tldraw API**：不通过 React props 传递数据，而是直接调用 editor API
3. **稳定的引用**：使用 useRef 保持回调函数引用稳定
4. **明确的职责划分**：每个模块有明确的职责，容易维护和扩展

遵循这些原则，可以避免性能问题，保持代码清晰和可维护。
