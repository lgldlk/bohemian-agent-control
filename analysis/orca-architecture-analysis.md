# Orca 项目架构分析

## 项目概览

Orca 是一个 AI Agent 编排器（AI Orchestrator），主要特点：
- 支持多个 AI coding agents（Claude Code、Codex、Pi等）并行运行
- 使用 Git worktree 隔离不同 agent 的工作空间
- 提供 Desktop 版（Electron）和 Web 版两种运行模式
- 支持移动端伴侣应用来监控和控制 agents
- 内置高性能终端模拟器

## 核心架构

### 1. 技术栈

**桌面端（Electron）**：
- **主进程（Main Process）**: Node.js
  - node-pty: 创建和管理伪终端（PTY）
  - ssh2: SSH 远程连接支持
  - ws: WebSocket 服务器
  
- **渲染进程（Renderer Process）**: React
  - xterm.js: 终端 UI 渲染
  - @xterm/addon-webgl: WebGL 加速渲染
  - Monaco Editor: 代码编辑器
  - Zustand: 状态管理

- **预加载脚本（Preload）**: 桥接主进程和渲染进程

**Web 版**：
- 使用 WebSocket 连接到远程 runtime
- 通过 RPC 调用后端服务
- 支持完全的 Web 端运行

### 2. 项目结构

```
src/
├── main/                    # Electron 主进程
│   ├── runtime/            # Runtime 服务核心
│   ├── providers/          # PTY providers (local, SSH)
│   ├── ipc/               # IPC 处理器
│   ├── agent-hooks/       # Agent 状态监控
│   └── pty/               # PTY 管理
├── renderer/               # React 渲染进程
│   └── src/
│       └── web/           # Web 版本支持
│           └── preload-api/  # Web API 桥接
├── preload/               # Electron preload 脚本
└── shared/                # 共享类型和工具
```

## 回答你的三个问题

### 问题1：它是怎么去调度这个 Agent 的？

#### Agent 调度机制

**核心组件**：`OrcaRuntimeService`

**调度流程**：

1. **Agent Session 创建**
   ```typescript
   // src/main/runtime/orca-runtime-structured-agent-session-launch-tui.ts
   async ensureAgentSession({
     worktree: 'id:${workspaceId}',
     agent: 'claude' | 'codex' | 'pi',
     providerSession: { key: 'session_id', id: sessionId },
     presentation: 'background' | 'foreground'
   })
   ```

2. **PTY 生命周期管理**
   - 每个 agent 运行在独立的 PTY（伪终端）中
   - PTY 通过 `LocalPtyProvider` 或 `SshPtyProvider` 创建
   - PTY 注册表（`pty-registry.ts`）追踪所有活跃的终端

3. **Worktree 隔离**
   - 使用 Git worktree 为每个 agent 创建独立的工作目录
   - 每个 worktree 有唯一的 `worktreeId`
   - Agent 在自己的 worktree 中工作，互不干扰

4. **Agent 状态监控**
   ```typescript
   // src/main/agent-hooks/server.ts
   agentHookServer.ingestTerminalStatus(event)
   agentHookServer.getStatusSnapshot()
   ```
   - 通过 agent hooks 监控 agent 状态
   - 收集 agent 的输出、进度、错误等信息
   - 实时更新到 UI 和移动端

5. **多 Agent 并行**
   - 每个 agent 在独立的进程和 worktree 中运行
   - Runtime Service 维护所有 agent sessions 的映射
   - 支持同时运行多个 agent 处理同一任务

**关键设计**：
- **Provider Pattern**: 抽象出 `IPtyProvider` 接口，支持本地和远程 PTY
- **Session Management**: 每个 agent 有唯一的 session ID
- **Process Tracking**: 追踪 PTY 的 process ID、pane key、tab ID
- **Lifecycle Hooks**: spawn → attach → monitor → cleanup

### 问题2：Web 端应该怎么去跟 Agent 做高性能的控制？

#### Web 端高性能控制架构

**1. 通信层：WebSocket + RPC**

```typescript
// src/renderer/src/web/web-runtime-connection-transport.ts
// Web 端通过 WebSocket 连接到 runtime
class WebRuntimeConnectionTransport {
  connect() → WebSocket
  call(method, params) → Promise<result>
  subscribe(event, handler)
}
```

**核心机制**：
- **双向通信**: WebSocket 保持长连接
- **RPC 调用**: 方法调用通过 JSON-RPC 协议
- **订阅模式**: 实时事件通过 WebSocket 推送

**2. Preload API 层**

Web 版模拟 Electron 的 preload API：
```typescript
// src/renderer/src/web/preload-api/
- web-terminal-api.ts      // 终端操作
- web-worktrees-api.ts      // Worktree 管理
- web-agent-status-api.ts   // Agent 状态
- web-runtime-calls.ts      // 通用 RPC 调用
```

**3. 性能优化技术**

**a) 批量传输（Batching）**
```typescript
// src/main/ipc/pty-output-batching-drain.ts
// PTY 输出批量发送，减少 IPC 调用
onTerminalSideEffects(batch: TerminalSideEffectBatch)
```

**b) 背压控制（Backpressure）**
```typescript
// src/main/providers/local-pty-provider.ts
pauseProducer(ptyId)   // 暂停数据生产
resumeProducer(ptyId)  // 恢复数据生产
```
- 当 Web 端处理不过来时暂停数据推送
- 防止内存溢出

**c) 增量更新**
```typescript
// 只发送变化的数据，不是整个状态
- Terminal 只发送新的输出行
- File changes 只发送 diff
- Agent status 只发送变化的字段
```

**d) 优先级调度**
```typescript
// src/main/runtime/terminal-wait-tail-state.ts
// 终端输出按优先级处理
- 前台 terminal 优先级高
- 后台 terminal 可以延迟
```

**e) WebGL 渲染**
```typescript
// 使用 @xterm/addon-webgl 加速终端渲染
// 即使在 Web 端也能流畅渲染大量文本
```

**4. 订阅机制**

```typescript
// src/renderer/src/web/web-runtime-subscription-registry.ts
class SubscriptionRegistry {
  subscribe(event, handler) {
    // 注册事件处理器
    return unsubscribe
  }
}

// 常见订阅事件：
- terminal:data        // 终端输出
- agent:status         // Agent 状态变化
- worktree:changed     // Worktree 变化
- file:changed         // 文件变化
```

**5. 心跳机制**

```typescript
// src/renderer/src/web/web-runtime-connection-heartbeat.ts
// 定期发送心跳确保连接活跃
// 断线自动重连
class ConnectionHeartbeat {
  startHeartbeat(interval: 30s)
  onHeartbeatFailed() → reconnect()
}
```

**6. 请求去重和缓存**

```typescript
// src/renderer/src/web/web-runtime-request-registry.ts
// 相同的请求复用 Promise
// 避免重复调用
class RequestRegistry {
  call(method, params) → Promise<result>
  // 如果有相同的 pending 请求，直接返回那个 Promise
}
```

**建议给你的项目**：
1. **使用 WebSocket 而不是 HTTP 轮询**
2. **实现批量传输**：累积多个小更新一次发送
3. **背压控制**：客户端来不及处理时暂停服务端推送
4. **优先级队列**：重要的更新优先发送
5. **增量更新**：只发送变化的数据
6. **订阅模式**：而不是轮询
7. **心跳 + 自动重连**
8. **请求去重**：避免重复的 RPC 调用

### 问题3：它自己直接在里面实现了一套终端吗？还是怎么操作的？

#### 终端实现架构

**答案：Orca 组合了多个成熟的终端技术，而不是从零实现**

**1. 后端：node-pty**

```typescript
// node-pty 是一个 Node.js 原生模块
// 提供真实的伪终端（PTY）功能
import * as pty from 'node-pty'

// 创建 PTY
const ptyProcess = pty.spawn(shell, args, {
  name: 'xterm-256color',
  cols: 80,
  rows: 30,
  cwd: workingDirectory,
  env: environment
})

// 监听输出
ptyProcess.onData((data) => sendToRenderer(data))

// 写入输入
ptyProcess.write(userInput)

// 调整大小
ptyProcess.resize(cols, rows)
```

**node-pty 提供的能力**：
- 真实的 PTY（不是简单的 stdin/stdout）
- 支持所有 ANSI escape codes
- 支持颜色、光标控制、窗口大小等
- 跨平台（Windows、macOS、Linux）

**2. 前端：xterm.js + WebGL**

```typescript
// xterm.js 是一个成熟的终端 UI 库
import { Terminal } from '@xterm/xterm'
import { WebglAddon } from '@xterm/addon-webgl'
import { FitAddon } from '@xterm/addon-fit'

const terminal = new Terminal({
  fontFamily: 'Menlo, Monaco, "Courier New", monospace',
  fontSize: 14,
  theme: customTheme,
  cursorBlink: true,
  allowProposedApi: true
})

// WebGL 加速渲染
const webglAddon = new WebglAddon()
terminal.loadAddon(webglAddon)

// 自动调整大小
const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
fitAddon.fit()

// 接收数据
terminal.write(data)

// 用户输入
terminal.onData((data) => sendToPty(data))
```

**xterm.js 提供的能力**：
- 完整的 ANSI/VT100 支持
- WebGL 加速渲染（高性能）
- 搜索、链接检测、Unicode 支持
- Ligatures（连字）支持
- 可定制的主题

**3. Orca 的增强功能**

虽然使用了现成的库，Orca 在此基础上做了大量增强：

**a) PTY Provider 抽象**
```typescript
interface IPtyProvider {
  spawn(options): Promise<PtySpawnResult>
  write(id, data): boolean
  resize(id, cols, rows): void
  pauseProducer(id): void
  resumeProducer(id): void
  getProcess(id): ProcessInfo
  // ...
}

// 实现：
- LocalPtyProvider     // 本地 PTY
- SshPtyProvider       // SSH 远程 PTY
```

**b) 终端持久化**
```typescript
// src/main/runtime/orca-runtime-serialize-main-terminal-buffer.ts
// 终端内容序列化，重启后恢复
serializeTerminalBuffer(terminal) → savedState
restoreTerminalBuffer(savedState) → terminal
```

**c) 终端分屏**
```typescript
// src/main/runtime/orca-runtime-split-pty-backed-terminal.ts
// 支持无限分屏
splitTerminal(direction: 'horizontal' | 'vertical')
```

**d) 输出批量处理**
```typescript
// src/main/ipc/pty-output-batching-drain.ts
// 批量处理终端输出，减少 IPC 开销
class OutputBatcher {
  add(data)
  flush() → batch
}
```

**e) 背压控制**
```typescript
// 当渲染器处理不过来时暂停 PTY 输出
if (rendererBusy) {
  ptyProvider.pauseProducer(ptyId)
}
// 恢复后继续
ptyProvider.resumeProducer(ptyId)
```

**f) Terminal Parking**
```typescript
// 隐藏的终端暂停渲染以节省资源
// 切换回来时快速恢复
parkTerminal(id)    // 暂停更新
revealTerminal(id)  // 恢复更新
```

**g) WebGL 渲染优化**
```typescript
// src/main/runtime/terminal-wait-tail-state.ts
// 使用 WebGL 渲染大量文本
// 支持数万行滚动历史不卡顿
```

**h) SSH 支持**
```typescript
// src/main/providers/ssh-pty-provider.ts
// 通过 SSH 连接远程机器的 PTY
// 支持端口转发、文件传输等
class SshPtyProvider implements IPtyProvider {
  spawn(options) {
    // 通过 SSH 连接创建远程 PTY
    const channel = sshConnection.shell()
    return wrapChannelAsPty(channel)
  }
}
```

**4. 数据流向**

```
用户输入
  ↓
xterm.js (前端)
  ↓ WebSocket/IPC
Electron Renderer
  ↓ IPC
Electron Main Process
  ↓
PTY Provider (LocalPtyProvider 或 SshPtyProvider)
  ↓
node-pty
  ↓
真实的 Shell 进程 (bash/zsh/powershell)
  ↓ (输出)
node-pty
  ↓
PTY Provider
  ↓ (批量处理)
Output Batcher
  ↓ IPC
Electron Renderer
  ↓ WebSocket/IPC
xterm.js (渲染)
  ↓
用户看到输出
```

**5. 特殊优化**

**终端分屏管理**：
```typescript
// 支持多层嵌套分屏
type TerminalLayout = 
  | { type: 'terminal', ptyId: string }
  | { type: 'split', direction: 'h' | 'v', children: TerminalLayout[] }
```

**历史记录持久化**：
```typescript
// 终端历史保存到磁盘
// 重启后恢复完整的滚动历史
saveTerminalHistory(ptyId, buffer)
loadTerminalHistory(ptyId) → buffer
```

**Agent TUI 监控**：
```typescript
// 监控 agent 的 TUI 状态（如 Claude Code 的进度条）
detectTuiState(terminalOutput) → {
  isIdle: boolean,
  hasThinkingSpinner: boolean,
  currentStep: string
}
```

## 关键技术亮点

### 1. Worktree 隔离
- 每个 agent 在独立的 git worktree 中工作
- 可以并行测试多个方案
- 选择最好的结果合并

### 2. 多端同步
- Desktop、Web、Mobile 三端数据同步
- 使用 WebSocket relay 服务器
- 端到端加密（E2EE）

### 3. 高性能终端
- WebGL 渲染
- 输出批量处理
- 背压控制
- Terminal parking

### 4. SSH 远程执行
- 在远程服务器上运行 agents
- 本地文件编辑，远程执行
- 端口转发支持

### 5. Agent Hooks
- 监控 agent 状态
- 实时进度反馈
- 错误检测和恢复

## 总结

**Orca 的架构特点**：

1. **组合而非重造轮子**
   - 使用 node-pty 处理 PTY
   - 使用 xterm.js 渲染终端
   - 使用 Electron 构建桌面应用

2. **高度模块化**
   - Provider 抽象层
   - 清晰的分层架构
   - 可插拔的组件

3. **性能优先**
   - WebGL 加速
   - 批量传输
   - 背压控制
   - 智能缓存

4. **多端支持**
   - Desktop（Electron）
   - Web（WebSocket + RPC）
   - Mobile（React Native + relay）

5. **可靠性**
   - 状态持久化
   - 自动恢复
   - 心跳检测
   - 错误处理

**给你的项目建议**：

如果你要做类似的 Bohemian Agent Control，可以参考：

1. **终端层**：使用 node-pty + xterm.js，不要自己实现
2. **通信层**：WebSocket + RPC，支持订阅模式
3. **状态管理**：集中式 Runtime Service
4. **性能优化**：批量传输、背压控制、增量更新
5. **多端支持**：抽象 Provider 层，支持多种执行环境
6. **持久化**：会话状态、终端历史都要能恢复
7. **监控**：Agent 状态、进度、错误都要实时反馈
