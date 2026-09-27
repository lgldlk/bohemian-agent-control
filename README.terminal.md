# 🚀 Terminal Integration - Quick Start

## 📦 项目结构

```
bohemian-agent-control/
├── packages/                    # Monorepo 包
│   ├── terminal-protocol/       # 🔷 协议定义（前后端共享）
│   ├── terminal-server/         # 🔶 后端 PTY 服务
│   ├── terminal-client/         # 🔷 前端通信层
│   ├── terminal-ui/            # 🎨 React 终端组件
│   └── terminal-canvas/        # 🎨 画板集成
├── server/                      # 现有 API 服务器
└── src/                         # 现有前端代码
```

## 🎯 架构设计

### 职责划分

**后端 (terminal-server)**
- PTY 进程管理（node-pty）
- 输出缓冲（100ms批量发送）
- 背压控制（客户端忙时暂停）
- WebSocket 服务器（端口 18722）

**前端 (terminal-client + terminal-ui)**
- WebSocket 客户端
- xterm.js 渲染（WebGL 加速）
- 批量渲染（16ms，60fps）
- React 组件封装

**协议层 (terminal-protocol)**
- TypeScript 类型定义
- 前后端共享，确保类型安全

## 🚀 快速开始

### 1. 安装依赖

```bash
# 安装 pnpm（如果没有）
npm install -g pnpm

# 安装所有依赖
pnpm install
```

### 2. 启动开发环境

```bash
# 启动所有服务（前端 + API + Terminal 服务器）
pnpm dev

# 或者单独启动
pnpm dev:web      # 前端 (端口 18720)
pnpm dev:api      # API 服务器 (端口 18721)
pnpm dev:terminal # Terminal 服务器 (端口 18722)
```

### 3. 测试终端功能

访问 http://localhost:18720，你将看到：
- 现有的 pi-web 控制面板功能保持不变
- 新增终端功能按钮（待集成）

## 📝 使用示例

### 独立使用终端组件

```tsx
import { useEffect, useState } from 'react';
import { Terminal } from '@bohemian/terminal-ui';
import { TerminalClient } from '@bohemian/terminal-client';

function MyComponent() {
  const [terminalId, setTerminalId] = useState<string | null>(null);
  `pnpm dev` 会自动从 `~/.bohemian-agent-control/terminal.token` 注入终端 WebSocket token。独立使用时，请通过 Vite 的 `/ws/terminal` 代理连接；直接连接 `ws://localhost:18722` 需要自行读取 token 并附加为 `?token=...`。

  useEffect(() => {
    client.connect();
    return () => client.disconnect();
  }, [client]);

  const createTerminal = async () => {
    const terminal = await client.createTerminal({
      size: { cols: 80, rows: 24 },
      cwd: '/Users/yourname/project',
    });
    setTerminalId(terminal.id);
  };

  return (
    <div>
      <button onClick={createTerminal}>Create Terminal</button>
      {terminalId && <Terminal terminalId={terminalId} client={client} />}
    </div>
  );
}
```

### 画板集成（弹窗终端）

```tsx
import { TerminalClient } from '@bohemian/terminal-client';
import { CanvasTerminalIntegration } from '@bohemian/terminal-canvas';

function EvidenceBoard({ terminalClient }: { terminalClient: TerminalClient }) {
  return (
    <CanvasTerminalIntegration
      client={terminalClient}
      onNodeDoubleClick={(nodeId, terminalId) => {
        // 双击节点打开终端
        console.log('Open terminal for node:', nodeId);
      }}
    />
  );
}
```

### 使用终端管理器

```tsx
import { useTerminalManager } from '@bohemian/terminal-ui';

function TerminalManagerExample({ client }: { client: TerminalClient }) {
  const { terminals, createTerminal, closeTerminal } = useTerminalManager(client);

  return (
    <div>
      <button onClick={() => createTerminal({})}>
        New Terminal
      </button>
      
      {terminals.map(terminal => (
        <div key={terminal.id}>
          <Terminal {...terminal} />
          <button onClick={() => closeTerminal(terminal.id)}>Close</button>
        </div>
      ))}
    </div>
  );
}
```

## 🎨 画板集成步骤

### Step 1: 在 EvidenceBoard 中集成

```tsx
// src/board/EvidenceBoard.tsx
import { CanvasTerminalIntegration } from '@bohemian/terminal-canvas';

export function EvidenceBoard() {
  return (
    <>
      {/* 现有画板代码 */}
      <Tldraw {...tldrawProps} />
      
      {/* 添加终端集成 */}
      <CanvasTerminalIntegration
        onNodeDoubleClick={(nodeId) => {
          // 打开终端弹窗
        }}
      />
    </>
  );
}
```

### Step 2: 添加终端连线

```tsx
// 在画板上绘制节点到终端的连线
const drawConnectionLine = (nodeId: string, terminalId: string) => {
  // 使用 tldraw 的绘图 API
  editor.createShape({
    type: 'arrow',
    props: {
      start: { type: 'binding', boundShapeId: nodeId },
      end: { type: 'binding', boundShapeId: `terminal-${terminalId}` }
    }
  });
};
```

## 🔧 配置说明

### 端口配置

- **18720**: 前端开发服务器
- **18721**: API 服务器（现有）
- **18722**: Terminal WebSocket 服务器（新增）

### 环境变量

```bash
# .env
TERMINAL_WS_PORT=18722
TERMINAL_MAX_SESSIONS=50
```

## 📊 性能指标

基于 Orca 的架构优化：

- ⚡ **启动时间**: < 500ms
- ⚡ **输入延迟**: < 50ms
- ⚡ **内存占用**: 每终端 ~20MB
- ⚡ **并发支持**: > 50 个终端

## 🐛 故障排查

### WebSocket 连接失败

```bash
# 检查 terminal-server 是否运行
lsof -i :18722

# 查看日志
pnpm dev:terminal
```

### 终端渲染问题

```tsx
// 确保 xterm.js CSS 已加载
import 'xterm/css/xterm.css';
```

### TypeScript 类型错误

```bash
# 重新构建所有包
pnpm build:packages
```

- [x] 隐藏或未激活的终端暂停实时渲染，恢复时从服务端 snapshot 补齐
- [x] 跨终端命令和输出搜索
- [x] 终端 WebSocket / API 本机 token 鉴权和 Origin 校验
- [x] 使用 tmux 托管 PTY；terminal-server 重启后自动重新 attach，继续接管原有 shell / Agent

终端 server 默认会在可用时使用项目专属 tmux socket。关闭窗口或调用 `terminal.close` 会销毁 tmux session；普通服务重启只会断开 attach 客户端，不会杀掉 Agent。若系统没有 tmux，则自动降级为历史和元数据恢复。

已落地、且限制在画布交互范围内：

- [x] 节点关联终端：任务卡终端按钮按 Agent 类型写入官方 resume 命令
- [x] 浮动工作区：拖拽、缩放、最小化、最大化、关闭确认
- [x] 无限递归分屏：水平/垂直 split tree，拖拽调整比例
- [x] 终端托盘：多窗口切换、进程计数、一键最小化
- [x] 搜索 / 复制 / 粘贴 / 全选 / 清屏 / 重命名 / 重启
- [x] 滚动缓冲恢复：服务端持久化 snapshot + sequence，重连不丢字
- [x] 退出后可检查、可重启；关闭窗口才真正杀掉 PTY

刻意不做（不属于当前画布终端范围）：

- SSH / Docker / 远程 relay
- 浏览器 pane / Design Mode
- 终端录像回放

## 🤝 贡献指南

欢迎贡献代码！请遵循以下规范：

1. 每个 package 保持职责单一
2. 使用 TypeScript 严格模式
3. 添加适当的错误处理
4. 保持高性能（批量处理、背压控制）

## 📖 相关文档

- [项目开发规范](./docs/PROJECT_STANDARDS.md)
- [优化建议与路线图](./docs/OPTIMIZATION_ROADMAP.md)
- [架构设计](./analysis/bohemian-agent-control-architecture-design.md)
- [Orca 架构分析](./analysis/orca-architecture-analysis.md)
- [实施路线图](./analysis/bohemian-agent-control-terminal-roadmap.md)

## 💡 灵感来源

本项目的终端集成设计参考了 [Orca](https://github.com/stablyai/orca) 的架构，特别是：

- PTY 进程管理
- 批量传输和背压控制
- WebSocket 通信优化
- 终端渲染性能优化

---

**祝你构建愉快！** 🎉

有问题随时查看文档或提 issue。
