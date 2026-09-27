# Agent 工作指引

本文件是仓库级 Agent 指引。修改代码前先阅读本文件，以及与改动范围对应的 `docs/` 文档。项目是一个 pnpm workspace，运行时由 Vite 前端、HTTP API 服务和终端 WebSocket 服务组成。

## 项目定位

Bohemian Agent Control 把 Pi、Codex、Claude Code 等本地 CLI Agent 的会话、终端和任务状态投影到一个 tldraw 画布中。它不是远程执行平台：Agent、会话历史和 PTY 默认都在本机运行。

生产代码位于 `src/` 和 `packages/`。`analysis/` 是设计与调研材料，`reference/` 是参考项目副本，不属于本项目运行时依赖；除非任务明确要求，不要修改或从这些目录导入代码。

## 常用命令

```bash
pnpm install
pnpm dev                 # 前端 18720、API 18721、终端 WebSocket 18722
pnpm test                # 全量 protocol/server/api/terminal-ui/src 测试
pnpm build               # 构建 workspace packages、根类型检查和 Vite
pnpm perf:bundle         # 检查首屏资源预算
pnpm clean:packages      # 清理 package dist 和 tsbuildinfo
```

包级命令使用 pnpm filter，例如：

```bash
pnpm --filter @bohemian/terminal-protocol test
pnpm --filter @bohemian/terminal-ui test
pnpm --filter @bohemian/api-server typecheck
```

当前没有 ESLint/Prettier 配置，不要擅自引入格式化风格或批量重排无关文件。新增质量工具时，应先补根脚本、配置和文档，再将其纳入 CI。

## 架构边界

依赖方向和职责如下：

```text
agent-protocol       Agent DTO、适配器契约、Agent 命令
terminal-protocol    WebSocket 帧、终端快照、Agent 状态和活动契约
api-server           Agent 历史发现、文件系统浏览、HTTP 只读接口
terminal-server      PTY 所有权、启动、输出缓冲、背压、恢复
terminal-client      单一 WebSocket 传输、控制 RPC、输入和 ACK
terminal-ui          xterm 生命周期、渲染调度、hydration、终端控件
terminal-canvas      终端画布窗口和终端节点集成
src/domain           纯前端匹配、合并和生命周期规则
src/hooks            React 编排和轮询桥接
src/workspace        pending launch、最近目录等工作区状态
src/space            用户分组和任务归属
src/board            tldraw 投影、节点、终端活动和同步
src/components       页面和可复用 UI
```

核心状态所有权：

- API 任务快照由 `useTasks` 读取；前端不得直接读取 Agent 历史文件。
- pending launch 属于 `workspaceStore`。
- 分组属于 `spaceStore`；画板 pins/wires 属于 `boardStore`。
- PTY 和终端身份由 terminal-server 管理。
- tldraw shape 是投影，不是 Agent 身份源。
- `projectCardStatus` 是任务、终端和活跃状态的唯一 join；组件不得各自组合原始状态。

## 必须保持的行为契约

1. Agent 启动只能由 `useAgentLaunchController` 编排：先 pending，再分组和任务卡，之后创建 PTY，最后将 launch id 绑定到真实 session id。
2. `useBoardOperations` 只负责已有任务进入画板，不负责启动 Agent。
3. `terminalActivity` 只投影终端活动，不得修改 workspace 或 space store。
4. 打开终端不等于任务 running；PTY 存活、TUI 活动和 session 记录是三个独立轴。
5. PTY 消失不等于 Agent 删除；删除要通过 deleted tombstone 表达。
6. 终端传输的 protocol、server、client、UI 必须按顺序联动修改，并覆盖 stale generation、stale token、重连和 backlog 测试。
7. wheel 事件只能由 `terminalWheel` 处理，不得转成 Agent 状态、PTY 方向键或鼠标报告。
8. 不用固定 `setTimeout` 作为 shell ready barrier；应使用可观察的协议事件、状态或明确的重试边界。
9. Provider 特有 payload 进入终端或 UI 前必须先归一化。
10. 删除画板 shape 不得隐式删除 Agent session。
11. 不要在 UI 组件中用 `useSpaceStore.getState()` 拼装 Agent 生命周期；需要跨层操作时新增明确的 domain/controller API。

完整契约见 [`docs/ARCHITECTURE_CONTRACT.md`](./docs/ARCHITECTURE_CONTRACT.md) 和 [`docs/TERMINAL_RENDERING_ARCHITECTURE.md`](./docs/TERMINAL_RENDERING_ARCHITECTURE.md)。

## 修改流程

### 新增 Agent provider

1. 在 `packages/agent-protocol` 增加 DTO、AgentKind 或 adapter 契约。
2. 在 `packages/api-server/src/agents/<kind>/` 实现适配器，并在 registry 注册。
3. 明确 session id、工作目录、模型、状态和时间字段的来源。
4. 若涉及启动，贯穿 `TerminalCreateOptions`、launch identity 和绑定流程。
5. 为读取、匹配、启动失败、状态变化和重连补测试。

### 修改终端协议

1. 先改 `packages/terminal-protocol` 的类型和编码/解码规则。
2. 再改 terminal-server 的所有权、窗口和背压逻辑。
3. 再改 terminal-client 的帧处理和请求状态。
4. 最后改 terminal-ui 的 snapshot、scrollback、ACK 和渲染行为。
5. 同一变更中更新测试和架构文档，不通过隐式兼容或字符串猜测掩盖协议变化。

### 修改画板或状态

先判断数据是用户事实、服务端事实还是投影：

- 用户事实写入 space/workspace/board store。
- 服务端事实通过 API 或 terminal protocol 进入。
- 仅为渲染服务的数据放在 projection/domain 层。

涉及异步任务时要处理取消、重复触发、过期响应、组件卸载和错误反馈。涉及 `localStorage` 时要保留当前 schema 标识和运行时校验；本新项目不维护历史迁移链。

## 测试与验证

根据风险选择最小但足够的验证：

- 纯函数或协议：对应 package 的 Vitest 测试。
- Agent 适配器/API：api-server 测试，并覆盖空数据、格式变化、权限或子进程失败。
- PTY/WebSocket：terminal-server 测试，覆盖鉴权、重连、退出、背压和旧 token/generation。
- 终端 UI：terminal-ui 测试，覆盖 hydration、滚动、选择、粘贴、窗口和快照。
- 根测试覆盖 protocol、terminal-server、api-server、terminal-ui 和 `src` 下的稳定测试。
- 影响首屏、依赖或动态 import：运行 `pnpm perf:bundle`。
- 跨模块改动：运行 `pnpm check:all`，它会串行执行类型检查、测试、构建和 bundle 预算。

提交前至少执行：

```bash
pnpm test
pnpm build
pnpm perf:bundle
pnpm check:all
```

若性能门禁或某个环境相关测试当前无法通过，必须在交付说明中写明实际输出、原因和后续动作，不要把失败改成 warning 或调整阈值来掩盖问题。

## 安全与日志

- 本地 token 只可通过现有 token 文件和请求头机制使用；日志、文档和回答中不得输出 token、密码或私钥。
- API/终端默认监听 `127.0.0.1`。改监听地址、Origin 校验或鉴权时必须同步更新安全说明和测试。
- 日志应包含服务、操作、资源 id 和可检索上下文，但不得包含凭据或完整用户输入。
- 文件系统路径来自用户或本地配置时应校验边界，不要把任意路径访问扩展到没有明确契约的接口。

## 完成检查

- 改动只覆盖任务需要的模块，没有重写无关文件。
- 类型、测试和构建结果已实际执行并记录。
- 新增公开协议、状态或持久化版本已经更新相应文档。
- README、包 README 和脚本说明没有互相矛盾或指向不存在的文件。
- 若改变了行为，补充回归测试或明确记录未覆盖的风险。
