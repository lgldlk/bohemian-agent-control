# Bohemian Agent Control - Terminal Integration Roadmap

> 基于 Orca 架构，实现画板内终端交互系统
> 
> **核心目标**：从依赖 Pi Web 到独立的终端交互系统

---

## 🎯 项目愿景

在画板（Canvas）上以节点（Node）形式创建和管理多个 AI Agent 终端，实现：
- ✅ 点击节点打开终端弹窗
- ✅ 终端与节点可视化连线
- ✅ 多终端并行交互
- ✅ 终端状态实时可视化

---

## 📋 实施阶段

### **Phase 1: 基础架构搭建** (Week 1-2)

#### 1.1 项目结构重组
- [ ] 创建 `packages/terminal-core` - 终端核心逻辑
- [ ] 创建 `packages/terminal-ui` - 终端 React 组件
- [ ] 创建 `packages/pty-provider` - PTY 抽象层
- [ ] 更新 `tsconfig` 支持 monorepo 引用

**目录结构**：
```
bohemian-agent-control/
├── packages/
│   ├── terminal-core/          # 终端核心
│   │   ├── src/
│   │   │   ├── pty/            # PTY provider
│   │   │   ├── runtime/        # 运行时管理
│   │   │   ├── transport/      # 通信层
│   │   │   └── index.ts
│   │   └── package.json
│   ├── terminal-ui/            # 终端 UI 组件
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── Terminal.tsx
│   │   │   │   ├── TerminalModal.tsx
│   │   │   │   └── TerminalTabs.tsx
│   │   │   └── hooks/
│   │   └── package.json
│   └── canvas/                 # 现有画板
└── apps/
    └── web/                    # 主应用
```

#### 1.2 依赖安装
```bash
# 后端 PTY
pnpm add node-pty @types/node-pty

# 前端终端渲染
pnpm add @xterm/xterm @xterm/addon-fit @xterm/addon-webgl
pnpm add @xterm/addon-web-links @xterm/addon-search

# 通信
pnpm add ws @types/ws

# 状态管理
pnpm add zustand immer
```

---

### **Phase 2: PTY Provider 实现** (Week 2-3)

参考：`analysis/orca/src/main/providers/local-pty-provider.ts`

#### 2.1 PTY Provider 接口定义
- [ ] 定义 `IPtyProvider` 接口
- [ ] 定义 `PtySpawnOptions` 和 `PtySpawnResult` 类型
- [ ] 定义 `PtyProcess` 数据结构

**文件**: `packages/terminal-core/src/pty/types.ts`
```typescript
export interface IPtyProvider {
  spawn(options: PtySpawnOptions): Promise<PtySpawnResult>
  write(id: string, data: string): boolean
  resize(id: string, cols: number, rows: number): void
  kill(id: string): Promise<void>
  onData(id: string, callback: (data: string) => void): void
  onExit(id: string, callback: (code: number) => void): void
}

export interface PtySpawnOptions {
  shell?: string
  cwd?: string
  env?: Record<string, string>
  cols?: number
  rows?: number
}

export interface PtySpawnResult {
  id: string
  processId: number
}
```

#### 2.2 Local PTY Provider 实现
- [ ] 实现 `LocalPtyProvider` 类
- [ ] 实现 PTY 进程生命周期管理
- [ ] 实现数据流控制（pause/resume）
- [ ] 实现进程清理和资源回收

**文件**: `packages/terminal-core/src/pty/local-pty-provider.ts`
```typescript
import * as pty from 'node-pty'

export class LocalPtyProvider implements IPtyProvider {
  private processes = new Map<string, IPtyProcess>()
  
  async spawn(options: PtySpawnOptions): Promise<PtySpawnResult> {
    const shell = options.shell || getDefaultShell()
    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-color',
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd || process.cwd(),
      env: { ...process.env, ...options.env }
    })
    
    const id = generatePtyId()
    this.processes.set(id, {
      id,
      pty: ptyProcess,
      dataCallbacks: [],
      exitCallbacks: []
    })
    
    // 绑定事件
    ptyProcess.onData(data => this.emitData(id, data))
    ptyProcess.onExit(({ exitCode }) => this.emitExit(id, exitCode))
    
    return { id, processId: ptyProcess.pid }
  }
  
  write(id: string, data: string): boolean {
    const process = this.processes.get(id)
    if (!process) return false
    process.pty.write(data)
    return true
  }
  
  // ... 其他方法实现
}
```

#### 2.3 PTY Registry（进程注册表）
- [ ] 实现全局 PTY 进程注册表
- [ ] 支持根据 ID 查找进程
- [ ] 支持根据节点 ID 查找关联的终端

**文件**: `packages/terminal-core/src/pty/registry.ts`
```typescript
export class PtyRegistry {
  private ptys = new Map<string, PtyRegistration>()
  
  register(entry: PtyRegistration): void {
    this.ptys.set(entry.ptyId, entry)
  }
  
  unregister(ptyId: string): void {
    this.ptys.delete(ptyId)
  }
  
  findByNodeId(nodeId: string): PtyRegistration[] {
    return Array.from(this.ptys.values())
      .filter(pty => pty.nodeId === nodeId)
  }
  
  getAll(): PtyRegistration[] {
    return Array.from(this.ptys.values())
  }
}

export interface PtyRegistration {
  ptyId: string
  nodeId: string | null      // 关联的画板节点
  canvasId: string | null    // 所属画板
  processId: number
  status: 'active' | 'paused' | 'exited'
}
```

---

### **Phase 3: 通信层实现** (Week 3-4)

参考：`analysis/orca/src/renderer/src/web/web-runtime-connection-transport.ts`

#### 3.1 WebSocket Server（Node.js 端）
- [ ] 创建 WebSocket 服务器
- [ ] 实现 RPC 调用机制
- [ ] 实现订阅/发布模式
- [ ] 实现心跳和重连

**文件**: `packages/terminal-core/src/transport/ws-server.ts`
```typescript
import { WebSocketServer, WebSocket } from 'ws'

export class TerminalWebSocketServer {
  private wss: WebSocketServer
  private clients = new Map<string, ClientConnection>()
  
  constructor(port: number) {
    this.wss = new WebSocketServer({ port })
    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req)
    })
  }
  
  private handleConnection(ws: WebSocket, req: any) {
    const clientId = generateClientId()
    const client = new ClientConnection(clientId, ws)
    this.clients.set(clientId, client)
    
    ws.on('message', (data) => this.handleMessage(client, data))
    ws.on('close', () => this.handleDisconnect(client))
    
    // 发送欢迎消息
    client.send({ type: 'connected', clientId })
  }
  
  private async handleMessage(client: ClientConnection, data: any) {
    const message = JSON.parse(data.toString())
    
    switch (message.type) {
      case 'rpc':
        await this.handleRpc(client, message)
        break
      case 'subscribe':
        this.handleSubscribe(client, message)
        break
      case 'pty:write':
        this.handlePtyWrite(message)
        break
    }
  }
  
  // RPC 调用处理
  private async handleRpc(client: ClientConnection, message: any) {
    const { id, method, params } = message
    try {
      const result = await this.callMethod(method, params)
      client.send({ type: 'rpc:response', id, result })
    } catch (error) {
      client.send({ 
        type: 'rpc:error', 
        id, 
        error: error.message 
      })
    }
  }
  
  // 广播给所有订阅的客户端
  broadcast(topic: string, data: any) {
    for (const client of this.clients.values()) {
      if (client.isSubscribed(topic)) {
        client.send({ type: 'event', topic, data })
      }
    }
  }
}
```

#### 3.2 WebSocket Client（浏览器端）
- [ ] 实现 WebSocket 客户端
- [ ] 实现 RPC 调用包装
- [ ] 实现自动重连
- [ ] 实现请求队列和去重

**文件**: `packages/terminal-ui/src/transport/ws-client.ts`
```typescript
export class TerminalWebSocketClient {
  private ws: WebSocket | null = null
  private requestId = 0
  private pendingRequests = new Map<number, PendingRequest>()
  private subscriptions = new Map<string, Set<Callback>>()
  private reconnectTimer: any = null
  
  constructor(private url: string) {
    this.connect()
  }
  
  private connect() {
    this.ws = new WebSocket(this.url)
    
    this.ws.onopen = () => {
      console.log('[WS] Connected')
      this.reconnectTimer = null
    }
    
    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleMessage(message)
    }
    
    this.ws.onclose = () => {
      console.log('[WS] Disconnected, reconnecting...')
      this.scheduleReconnect()
    }
  }
  
  private handleMessage(message: any) {
    switch (message.type) {
      case 'rpc:response':
        this.resolvePendingRequest(message.id, message.result)
        break
      case 'rpc:error':
        this.rejectPendingRequest(message.id, message.error)
        break
      case 'event':
        this.emitEvent(message.topic, message.data)
        break
    }
  }
  
  // RPC 调用
  async call<T>(method: string, params?: any): Promise<T> {
    const id = this.requestId++
    const message = { type: 'rpc', id, method, params }
    
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject })
      this.ws?.send(JSON.stringify(message))
      
      // 超时处理
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error('Request timeout'))
        }
      }, 30000)
    })
  }
  
  // 订阅事件
  subscribe(topic: string, callback: Callback) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())
      this.ws?.send(JSON.stringify({ type: 'subscribe', topic }))
    }
    this.subscriptions.get(topic)!.add(callback)
    
    // 返回取消订阅函数
    return () => {
      const callbacks = this.subscriptions.get(topic)
      if (callbacks) {
        callbacks.delete(callback)
        if (callbacks.size === 0) {
          this.subscriptions.delete(topic)
          this.ws?.send(JSON.stringify({ type: 'unsubscribe', topic }))
        }
      }
    }
  }
  
  private scheduleReconnect() {
    if (this.reconnectTimer) return
    this.reconnectTimer = setTimeout(() => {
      this.connect()
    }, 3000)
  }
}
```

#### 3.3 批量传输和背压控制
- [ ] 实现输出批量累积
- [ ] 实现背压检测
- [ ] 实现优先级队列

**文件**: `packages/terminal-core/src/transport/batching.ts`
```typescript
export class OutputBatcher {
  private buffer: string[] = []
  private flushTimer: any = null
  private readonly maxBatchSize = 4096
  private readonly maxDelay = 16 // ms
  
  push(data: string) {
    this.buffer.push(data)
    
    // 超过大小立即刷新
    if (this.getTotalSize() >= this.maxBatchSize) {
      this.flush()
      return
    }
    
    // 否则延迟刷新
    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.maxDelay)
    }
  }
  
  flush() {
    if (this.buffer.length === 0) return
    
    const data = this.buffer.join('')
    this.buffer = []
    
    if (this.flushTimer) {
      clearTimeout(this.flushTimer)
      this.flushTimer = null
    }
    
    this.emit('data', data)
  }
  
  private getTotalSize(): number {
    return this.buffer.reduce((sum, str) => sum + str.length, 0)
  }
}
```

---

### **Phase 4: 前端终端组件** (Week 4-5)

参考 xterm.js 官方文档和 Orca 的实现

#### 4.1 Terminal 基础组件
- [ ] 创建 `Terminal` React 组件
- [ ] 集成 xterm.js
- [ ] 实现自适应大小（addon-fit）
- [ ] 实现 WebGL 加速（addon-webgl）

**文件**: `packages/terminal-ui/src/components/Terminal.tsx`
```tsx
import React, { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'

export interface TerminalProps {
  ptyId: string
  onData?: (data: string) => void
  onResize?: (cols: number, rows: number) => void
  className?: string
}

export const Terminal: React.FC<TerminalProps> = ({
  ptyId,
  onData,
  onResize,
  className
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  
  useEffect(() => {
    if (!containerRef.current) return
    
    // 创建终端实例
    const terminal = new XTerm({
      fontSize: 14,
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      theme: {
        background: '#1e1e1e',
        foreground: '#d4d4d4',
      },
      cursorBlink: true,
      allowTransparency: false,
    })
    
    // 添加插件
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.loadAddon(new WebLinksAddon())
    
    // 尝试启用 WebGL
    try {
      terminal.loadAddon(new WebglAddon())
    } catch (e) {
      console.warn('WebGL addon failed, fallback to canvas')
    }
    
    // 挂载到 DOM
    terminal.open(containerRef.current)
    fitAddon.fit()
    
    // 监听用户输入
    terminal.onData(data => {
      onData?.(data)
    })
    
    // 监听大小变化
    terminal.onResize(({ cols, rows }) => {
      onResize?.(cols, rows)
    })
    
    // 窗口大小变化时自适应
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)
    
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon
    
    return () => {
      resizeObserver.disconnect()
      terminal.dispose()
    }
  }, [])
  
  // 暴露写入方法
  useImperativeHandle(ref, () => ({
    write: (data: string) => {
      terminalRef.current?.write(data)
    },
    clear: () => {
      terminalRef.current?.clear()
    },
    fit: () => {
      fitAddonRef.current?.fit()
    }
  }))
  
  return (
    <div 
      ref={containerRef} 
      className={className}
      style={{ width: '100%', height: '100%' }}
    />
  )
}
```

#### 4.2 TerminalModal 弹窗组件
- [ ] 创建可拖拽的终端弹窗
- [ ] 实现最小化/最大化/关闭
- [ ] 实现多标签页支持
- [ ] 集成到画板系统

**文件**: `packages/terminal-ui/src/components/TerminalModal.tsx`
```tsx
import React, { useState } from 'react'
import { Terminal } from './Terminal'
import { useTerminalConnection } from '../hooks/useTerminalConnection'

export interface TerminalModalProps {
  nodeId: string
  canvasId: string
  onClose: () => void
  initialPosition?: { x: number; y: number }
}

export const TerminalModal: React.FC<TerminalModalProps> = ({
  nodeId,
  canvasId,
  onClose,
  initialPosition = { x: 100, y: 100 }
}) => {
  const [position, setPosition] = useState(initialPosition)
  const [size, setSize] = useState({ width: 800, height: 600 })
  const [isMaximized, setIsMaximized] = useState(false)
  
  const { ptyId, write, status } = useTerminalConnection({
    nodeId,
    canvasId,
    shell: '/bin/bash',
    cwd: '~/'
  })
  
  const handleDragStart = (e: React.MouseEvent) => {
    const startX = e.clientX - position.x
    const startY = e.clientY - position.y
    
    const handleDrag = (e: MouseEvent) => {
      setPosition({
        x: e.clientX - startX,
        y: e.clientY - startY
      })
    }
    
    const handleDragEnd = () => {
      document.removeEventListener('mousemove', handleDrag)
      document.removeEventListener('mouseup', handleDragEnd)
    }
    
    document.addEventListener('mousemove', handleDrag)
    document.addEventListener('mouseup', handleDragEnd)
  }
  
  return (
    <div
      className="terminal-modal"
      style={{
        position: 'absolute',
        left: isMaximized ? 0 : position.x,
        top: isMaximized ? 0 : position.y,
        width: isMaximized ? '100vw' : size.width,
        height: isMaximized ? '100vh' : size.height,
        backgroundColor: '#1e1e1e',
        border: '1px solid #444',
        borderRadius: isMaximized ? 0 : 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 1000,
      }}
    >
      {/* 标题栏 */}
      <div
        className="terminal-header"
        onMouseDown={handleDragStart}
        style={{
          height: 40,
          backgroundColor: '#2d2d2d',
          borderBottom: '1px solid #444',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          cursor: 'move',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: '#888', fontSize: 12 }}>
            Terminal - Node {nodeId}
          </span>
          {status !== 'connected' && (
            <span style={{ color: '#f59e0b', fontSize: 11 }}>
              {status}
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setIsMaximized(!isMaximized)}>
            {isMaximized ? '□' : '⛶'}
          </button>
          <button onClick={onClose}>✕</button>
        </div>
      </div>
      
      {/* 终端内容 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {ptyId && (
          <Terminal
            ptyId={ptyId}
            onData={write}
            onResize={(cols, rows) => {
              // 通知后端调整 PTY 大小
            }}
          />
        )}
      </div>
    </div>
  )
}
```

#### 4.3 Custom Hook: useTerminalConnection
- [ ] 封装终端连接逻辑
- [ ] 自动处理重连
- [ ] 管理终端状态

**文件**: `packages/terminal-ui/src/hooks/useTerminalConnection.ts`
```typescript
import { useEffect, useState, useCallback, useRef } from 'react'
import { useTerminalStore } from '../store/terminal-store'

export interface UseTerminalConnectionOptions {
  nodeId: string
  canvasId: string
  shell?: string
  cwd?: string
}

export function useTerminalConnection(options: UseTerminalConnectionOptions) {
  const [ptyId, setPtyId] = useState<string | null>(null)
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting')
  const terminalRef = useRef<any>(null)
  
  const wsClient = useTerminalStore(state => state.wsClient)
  
  useEffect(() => {
    if (!wsClient) return
    
    // 创建 PTY
    wsClient.call('pty.spawn', {
      shell: options.shell,
      cwd: options.cwd,
      nodeId: options.nodeId,
      canvasId: options.canvasId,
    }).then(result => {
      setPtyId(result.ptyId)
      setStatus('connected')
      
      // 订阅输出
      const unsubscribe = wsClient.subscribe(
        `pty:data:${result.ptyId}`,
        (data: string) => {
          terminalRef.current?.write(data)
        }
      )
      
      return () => unsubscribe()
    }).catch(error => {
      console.error('Failed to spawn PTY:', error)
      setStatus('disconnected')
    })
  }, [wsClient, options])
  
  const write = useCallback((data: string) => {
    if (!ptyId || !wsClient) return
    wsClient.send({
      type: 'pty:write',
      ptyId,
      data
    })
  }, [ptyId, wsClient])
  
  return {
    ptyId,
    status,
    write,
    terminalRef
  }
}
```

---

### **Phase 5: 画板集成** (Week 5-6)

#### 5.1 节点-终端关联
- [ ] 在节点数据结构中添加 `terminalId` 字段
- [ ] 实现节点点击打开终端
- [ ] 实现终端关闭时清理关联

**文件**: `apps/web/src/components/Canvas/Node.tsx`
```tsx
import { TerminalModal } from '@/packages/terminal-ui'

export const Node: React.FC<NodeProps> = ({ node, canvasId }) => {
  const [showTerminal, setShowTerminal] = useState(false)
  
  const handleDoubleClick = () => {
    setShowTerminal(true)
  }
  
  return (
    <>
      <div 
        className="node"
        onDoubleClick={handleDoubleClick}
      >
        {/* 节点内容 */}
        <div className="node-header">
          {node.title}
          {node.terminalId && (
            <TerminalIcon className="text-green-500" />
          )}
        </div>
      </div>
      
      {showTerminal && (
        <TerminalModal
          nodeId={node.id}
          canvasId={canvasId}
          onClose={() => setShowTerminal(false)}
          initialPosition={{
            x: node.position.x + 50,
            y: node.position.y + 50
          }}
        />
      )}
    </>
  )
}
```

#### 5.2 可视化连线
- [ ] 终端激活时在节点上显示指示器
- [ ] 绘制从节点到终端弹窗的连线
- [ ] 连线样式根据终端状态变化（运行中/空闲/错误）

**文件**: `apps/web/src/components/Canvas/TerminalConnection.tsx`
```tsx
export const TerminalConnection: React.FC<{
  fromNode: Node
  toTerminal: { x: number; y: number }
  status: 'active' | 'idle' | 'error'
}> = ({ fromNode, toTerminal, status }) => {
  const color = {
    active: '#22c55e',
    idle: '#94a3b8',
    error: '#ef4444'
  }[status]
  
  return (
    <svg
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 999
      }}
    >
      <path
        d={`M ${fromNode.x} ${fromNode.y} 
            Q ${(fromNode.x + toTerminal.x) / 2} ${fromNode.y}
            ${toTerminal.x} ${toTerminal.y}`}
        stroke={color}
        strokeWidth={2}
        fill="none"
        strokeDasharray="5,5"
      />
    </svg>
  )
}
```

#### 5.3 多终端管理
- [ ] 实现终端状态全局 Store
- [ ] 支持终端最小化到托盘
- [ ] 支持快速切换终端
- [ ] 显示所有终端列表

**文件**: `packages/terminal-ui/src/store/terminal-store.ts`
```typescript
import create from 'zustand'
import { immer } from 'zustand/middleware/immer'

export interface TerminalState {
  terminals: Map<string, TerminalInfo>
  activeTerminalId: string | null
  wsClient: TerminalWebSocketClient | null
}

export interface TerminalInfo {
  ptyId: string
  nodeId: string
  canvasId: string
  title: string
  status: 'active' | 'idle' | 'error'
  position: { x: number; y: number }
  size: { width: number; height: number }
  isMinimized: boolean
}

export const useTerminalStore = create<TerminalState>()(
  immer((set) => ({
    terminals: new Map(),
    activeTerminalId: null,
    wsClient: null,
    
    addTerminal: (terminal: TerminalInfo) => {
      set(state => {
        state.terminals.set(terminal.ptyId, terminal)
        state.activeTerminalId = terminal.ptyId
      })
    },
    
    removeTerminal: (ptyId: string) => {
      set(state => {
        state.terminals.delete(ptyId)
        if (state.activeTerminalId === ptyId) {
          const remaining = Array.from(state.terminals.keys())
          state.activeTerminalId = remaining[0] || null
        }
      })
    },
    
    updateTerminal: (ptyId: string, updates: Partial<TerminalInfo>) => {
      set(state => {
        const terminal = state.terminals.get(ptyId)
        if (terminal) {
          Object.assign(terminal, updates)
        }
      })
    },
    
    setActiveTerminal: (ptyId: string) => {
      set(state => {
        state.activeTerminalId = ptyId
      })
    },
    
    minimizeTerminal: (ptyId: string) => {
      set(state => {
        const terminal = state.terminals.get(ptyId)
        if (terminal) {
          terminal.isMinimized = true
        }
      })
    }
  }))
)
```

#### 5.4 终端托盘
- [ ] 在画板底部显示终端托盘
- [ ] 显示所有最小化的终端
- [ ] 点击恢复终端

**文件**: `apps/web/src/components/Canvas/TerminalTray.tsx`
```tsx
export const TerminalTray: React.FC = () => {
  const terminals = useTerminalStore(state => 
    Array.from(state.terminals.values()).filter(t => t.isMinimized)
  )
  
  const restoreTerminal = useTerminalStore(state => state.updateTerminal)
  
  if (terminals.length === 0) return null
  
  return (
    <div className="terminal-tray">
      {terminals.map(terminal => (
        <div
          key={terminal.ptyId}
          className="terminal-tray-item"
          onClick={() => restoreTerminal(terminal.ptyId, { isMinimized: false })}
        >
          <TerminalIcon />
          <span>{terminal.title}</span>
          <StatusIndicator status={terminal.status} />
        </div>
      ))}
    </div>
  )
}
```

---

### **Phase 6: 持久化与会话恢复** (Week 6-7)

参考：`analysis/orca/src/main/runtime/orca-runtime-serialize-main-terminal-buffer.ts`

#### 6.1 会话状态持久化
- [ ] 保存终端会话信息到 IndexedDB
- [ ] 保存终端历史记录
- [ ] 保存节点-终端关联关系

**文件**: `packages/terminal-core/src/persistence/session-store.ts`
```typescript
export class TerminalSessionStore {
  private db: IDBDatabase
  
  async saveSession(session: TerminalSession): Promise<void> {
    const tx = this.db.transaction('sessions', 'readwrite')
    const store = tx.objectStore('sessions')
    await store.put(session)
  }
  
  async restoreSessions(canvasId: string): Promise<TerminalSession[]> {
    const tx = this.db.transaction('sessions', 'readonly')
    const store = tx.objectStore('sessions')
    const index = store.index('canvasId')
    return await index.getAll(canvasId)
  }
  
  async saveBuffer(ptyId: string, buffer: string): Promise<void> {
    // 保存终端缓冲区以便恢复
  }
}

export interface TerminalSession {
  ptyId: string
  nodeId: string
  canvasId: string
  shell: string
  cwd: string
  env: Record<string, string>
  createdAt: number
  lastActiveAt: number
}
```

#### 6.2 终端历史恢复
- [ ] 页面刷新后恢复终端
- [ ] 重连后恢复终端历史
- [ ] 显示历史记录加载状态

---

### **Phase 7: 高级特性** (Week 7-8)

#### 7.1 终端分屏
- [ ] 在弹窗内支持终端分屏
- [ ] 水平/垂直分割
- [ ] 拖拽调整分屏大小

#### 7.2 命令历史和搜索
- [ ] 实现命令历史记录
- [ ] 支持 Ctrl+R 搜索历史
- [ ] 跨终端搜索

#### 7.3 输出捕获和日志
- [ ] 捕获终端输出到日志文件
- [ ] 支持导出终端会话
- [ ] 实时输出搜索高亮

#### 7.4 性能优化
- [ ] 实现 Terminal Parking（隐藏终端暂停渲染）
- [ ] 实现虚拟滚动
- [ ] 优化大量输出场景

---

## 🎨 UI/UX 设计要点

### 视觉设计
```css
/* 终端主题 */
.terminal-modal {
  /* 暗色主题 */
  --bg-primary: #1e1e1e;
  --bg-secondary: #2d2d2d;
  --text-primary: #d4d4d4;
  --accent-green: #22c55e;
  --accent-blue: #3b82f6;
  --accent-red: #ef4444;
  
  /* 玻璃态效果 */
  backdrop-filter: blur(10px);
  background: rgba(30, 30, 30, 0.9);
}

/* 连线动画 */
@keyframes dash {
  to {
    stroke-dashoffset: -10;
  }
}

.terminal-connection {
  animation: dash 0.5s linear infinite;
}

/* 状态指示器 */
.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent-green);
  animation: pulse 2s ease-in-out infinite;
}
```

### 交互设计
1. **双击节点** → 打开终端弹窗
2. **拖拽标题栏** → 移动终端
3. **拖拽边缘** → 调整终端大小
4. **Cmd+K** → 快速切换终端
5. **Cmd+W** → 关闭当前终端
6. **Cmd+T** → 新建终端（关联到选中节点）

---

## 📊 技术架构总结

```
┌─────────────────────────────────────────────────────────────┐
│                     Browser (React)                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Canvas                                                 │ │
│  │  ├── Node (click) ──────→ TerminalModal                │ │
│  │  │                         ├── Terminal (xterm.js)     │ │
│  │  │                         └── useTerminalConnection   │ │
│  │  └── TerminalConnection (SVG)                          │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│                    WebSocket                                 │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
┌──────────────────────────┼───────────────────────────────────┐
│                    Node.js Server                            │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  TerminalWebSocketServer                                │ │
│  │  ├── RPC Handler                                        │ │
│  │  ├── Subscription Manager                               │ │
│  │  └── Output Batcher                                     │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  LocalPtyProvider                                       │ │
│  │  ├── spawn() ─────────→ node-pty                       │ │
│  │  ├── write()                                            │ │
│  │  ├── resize()                                           │ │
│  │  └── PtyRegistry                                        │ │
│  └────────────────────────────────────────────────────────┘ │
│                          │                                   │
└──────────────────────────┼───────────────────────────────────┘
                           │
                    ┌──────┴──────┐
                    │  PTY Process │
                    │  (bash/zsh)  │
                    └──────────────┘
```

---

## ✅ 验收标准

### Phase 1-2: 基础设施
- [ ] 能成功创建 PTY 进程
- [ ] 能接收终端输出
- [ ] 能发送用户输入
- [ ] 进程正常退出和清理

### Phase 3-4: 通信和UI
- [ ] WebSocket 连接稳定
- [ ] 终端实时响应用户输入
- [ ] 终端正确显示 ANSI 颜色
- [ ] 窗口大小改变时终端自适应

### Phase 5-6: 画板集成
- [ ] 双击节点打开终端
- [ ] 显示节点到终端的连线
- [ ] 多个终端可同时打开
- [ ] 最小化/恢复功能正常
- [ ] 页面刷新后能恢复会话

### Phase 7: 高级特性
- [ ] 终端分屏功能正常
- [ ] 大量输出不卡顿（10MB 输出 < 1s）
- [ ] 隐藏的终端暂停渲染节省资源

---

## 🔧 开发工具和脚本

### 开发命令
```json
{
  "scripts": {
    "dev": "pnpm --filter @pi/web dev",
    "dev:terminal": "pnpm --filter @pi/terminal-core dev",
    "build": "pnpm -r build",
    "test:terminal": "pnpm --filter @pi/terminal-core test",
    "test:e2e": "playwright test"
  }
}
```

### 调试工具
```typescript
// 终端调试面板
if (import.meta.env.DEV) {
  window.__TERMINAL_DEBUG__ = {
    listPtys: () => useTerminalStore.getState().terminals,
    killPty: (ptyId: string) => wsClient.call('pty.kill', { ptyId }),
    stats: () => ({
      totalPtys: useTerminalStore.getState().terminals.size,
      activePtys: Array.from(useTerminalStore.getState().terminals.values())
        .filter(t => t.status === 'active').length
    })
  }
}
```

---

## 📚 参考资料

### 核心依赖文档
- [xterm.js](https://xtermjs.org/)
- [node-pty](https://github.com/microsoft/node-pty)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)

### Orca 关键文件
- `analysis/orca/src/main/providers/local-pty-provider.ts` - PTY 实现
- `analysis/orca/src/renderer/src/web/web-runtime-connection-transport.ts` - WebSocket 通信
- `analysis/orca/src/main/ipc/pty.ts` - IPC 处理

---

## 🎯 里程碑

- **Week 2**: 能在终端输入命令并看到输出 ✅
- **Week 4**: 能通过 WebSocket 控制终端 ✅
- **Week 6**: 能在画板上打开多个终端弹窗 ✅
- **Week 8**: 完整功能发布 🚀

---

## 💡 未来扩展

### 远程终端支持
- SSH 连接到远程服务器
- Docker 容器内终端
- Kubernetes Pod 终端

### AI Agent 集成
- 自动检测 Agent 状态（Pi/Claude/Codex）
- Agent 输出语法高亮
- Agent 错误自动诊断

### 协作功能
- 终端共享（多人观看同一个终端）
- 终端录制和回放
- 终端输出注释和讨论

---

**Let's build something amazing! 🚀**
