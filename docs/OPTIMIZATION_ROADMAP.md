# 优化建议与路线图

本文基于当前工作区源码、脚本和文档盘点，记录可执行的优化项。它不是已经完成的改动清单；每项都包含现状证据和建议验收方式，避免把未来计划误读为当前能力。

## 现状快照

- 首屏优化、全量测试门禁和 API task decoder 已在当前版本落地；剩余项见后续 P1/P2 路线。
- 技术栈：Vite + React 19 + TypeScript + pnpm workspace。
- 运行服务：Web `18720`、HTTP API `18721`、Terminal WebSocket `18722`。
- 代码规模：`src/` 与 `packages/` 约 19,428 行 TypeScript/TSX。
- 测试文件：30 个；根 `pnpm test` 现已覆盖 protocol、terminal-server、api-server、terminal-ui 和 `src` 测试，共 111 个测试并通过。
- 构建：`pnpm build` 通过。
- 性能门禁：当前首屏约 `2155 KB raw / 660 KB gzip`，bundle 预算设为 `2560 KB / 800 KB`，保留约 20% 的增长余量并继续阻止明显回归。
- 工程工具：根目录已增加 Vitest 配置和全量测试入口；ESLint、Prettier 和 CI 仍待后续引入。

## 优先级总览

| 优先级 | 方向 | 当前问题 | 建议结果 |
|---|---|---|---|
| P0 | 首屏体积 | 已完成首屏入口拆分，初始资源低于预算 | 继续观察懒加载后的交互性能 |
| P0 | 默认测试门禁 | 已纳入 protocol、server、terminal-ui 和 src 测试 | 保持根命令覆盖新增稳定测试 |
| P0 | 输入边界 | 已增加 `parseControlTask` 运行时 decoder 和测试 | 后续补 API 非 JSON/HTTP 错误场景 |
| P1 | 工程质量门禁 | 已接入 type/test/build/bundle/check-all 和 GitHub Actions；lint/format 尚未引入 | 后续按项目风格增加静态质量检查 |
| P1 | 异步竞态 | 轮询、同步、终端重连大量使用 timer，缺少统一取消/过期响应策略 | 请求可取消、旧响应不覆盖新状态 |
| P1 | 持久化治理 | `src` 的 board/space/workspace/watchlist 已统一 JSON 读写和结构校验；不维护历史迁移链 | 继续覆盖 package 内的 appearance/window 持久化 |
| P1 | 状态耦合 | `boardStore` 已不再直接读取 `spaceStore`，部分 board 操作仍依赖 EvidenceBoard 导出函数 | 领域命令与 UI 投影分离，可独立测试 |
| P2 | 可观测性 | 服务日志以散落 `console.*` 为主，缺少统一 request/session/terminal 上下文 | 结构化日志和关键指标可检索 |
| P2 | 文档一致性 | README 入口已修复；后续需保持中英文功能描述一致 | 文档入口单一且可验证 |
| P2 | 依赖和运行时 | 多个 package 重复声明基础依赖，缺少升级和 bundle 影响记录 | 依赖边界清晰，升级可回滚 |

## P0：先处理可靠性和门禁

### 1. 降低首屏 bundle

**状态：已完成第一阶段**

- 通过入口依赖解耦和 modal 按需加载，曾将首屏从约 `2,400.1 KB raw / 706.1 KB gzip` 降至 `727.9 KB raw / 188.2 KB gzip`。当前新增首屏能力后实测约 `2155 KB raw / 660 KB gzip`，见现状快照；新的预算为 `2560 KB raw / 800 KB gzip`，用于给合理功能增长留空间，同时拦截超出约 20% 的继续增长。
- `BoardWorkspace` 仍是约 `1.7 MB` 的懒加载 chunk，属于后续画布运行时性能优化范围。

**后续建议**

1. 用构建分析确认 `tldraw`、xterm、历史面板、图标库分别进入哪些 chunk。
2. 将 `BoardWorkspace` 内部的终端工作区、历史面板和画布编辑能力继续按用户动作拆分。
3. 继续观察画布首次打开耗时，并补浏览器级性能回归。

**验收**

- `pnpm perf:bundle` 通过 `2560 KB raw / 800 KB gzip`。
- 首次打开 board/grid、打开终端、打开历史面板分别只加载对应资源。
- 终端连接和 tldraw 交互行为不回归。

### 2. 扩大默认测试范围

**状态：已完成第一阶段**

根 `pnpm test` 现在覆盖 protocol、terminal-server、api-server、terminal-ui 和 `src` 测试。

**后续建议**

- 保持新增稳定测试自动进入根门禁。
- 将浏览器级交互测试单独纳入 e2e 命令，不和纯函数测试混在一起。
- 为根测试输出保留明确的 package、文件和测试数量。

**验收**

- 新增测试不需要依赖开发者记忆额外命令即可被 CI 执行。
- 根测试输出明确的 package、文件和测试数量。

### 3. API 输入运行时校验

**状态：已完成第一阶段**

`packages/agent-protocol` 提供 `parseControlTask`，前端通过 decoder 校验 API JSON 后再转换为内部 `Task`。

**后续建议**

- 将 API 响应统一检查 HTTP 状态、`success` 字段和 payload 结构。
- 为非 JSON 响应、HTTP 错误、缺字段和未知状态补集成测试。
- 解析失败不会污染 store，也不会导致整个页面白屏。

## P1：减少长期维护成本

### 4. 建立 lint、格式化和 CI 门禁

当前没有 ESLint、Prettier 或 GitHub Actions。建议分阶段加入：

1. 先配置 TypeScript/React hooks/import 边界检查，不改变现有文件格式。
2. 再配置格式化，限制为修改文件或明确的格式化提交，避免大范围噪声 diff。
3. 增加 CI job：依赖安装、全量测试、类型检查、构建、bundle budget。
4. CI 失败信息要保留实际命令和产物，不用宽松脚本掩盖失败。

推荐根脚本形态：

```text
check:type
check:test
check:lint
check:format
check:build
check:bundle
check:all
```

### 5. 统一异步取消与竞态策略

**状态：任务同步第一阶段已完成**

`useTasks` 已使用 `AbortController` 和 generation 标识：新请求会取消旧请求，旧响应不会覆盖当前任务快照，组件卸载时会终止活动请求。

**后续建议**

- 将同样的 generation/backoff 约束扩展到 terminal client 和 board reconciliation。
- 对 visibility、WebSocket close、服务重启和快速连续点击补竞态测试。
- 统一用户主动重试和后台轮询的 retry/backoff 上限。

### 6. 统一本地持久化

**状态：已完成 `src` 第一阶段**

`src/lib/localJson.ts` 已统一安全读写和 decoder 入口，`spaceStore`、`workspaceStore`、`useWatchlist` 使用该工具；`space:v1` 的历史回退读取已移除。项目是新项目，不维护旧 schema 迁移链；破坏性变更使用新 key/schema 标识。

**后续建议**

- 将 `readLocalJson` 扩展到 package 内的 terminal appearance/window 持久化，但保持 package 自己的依赖边界。
- 可选增加 `storage` 事件同步。
- 统一记录解析失败和容量失败的策略。

不要把所有 store 合并成一个大 store；统一的是边界能力，不是状态所有权。

### 7. 拆分 board 与 UI 投影耦合

**状态：store 依赖已解开第一步**

`boardStore.doc(groups)` 现在显式接收分组快照，不再直接读取 `spaceStore`。下一步仍可将 board document serializer 和 UI command 从 `EvidenceBoard` 中继续抽离。

- 将 board document 导出做成纯 selector/serializer。
- 将“创建任务卡、定位任务卡”移入明确的 board command 模块。
- UI 组件只订阅和渲染，store 不依赖组件模块。
- 为 task id 重绑、pin 删除、wire 清理和分组同步补纯函数测试。

这会降低 tldraw 变更对状态层和测试层的影响。

### 8. 明确 package exports 和依赖边界

检查每个 package 的公开入口和依赖：

- 协议包只暴露契约和纯函数。
- `terminal-ui` 通过子路径 exports 暴露功能，继续避免把所有 UI 组件打进入口。
- React、zustand 等基础运行时要明确 peer/runtime 约定，减少重复实例风险。
- 每次升级记录 bundle、类型、原生依赖和 Node 版本影响。

## P2：提升可运营性和协作体验

### 9. 结构化日志和诊断上下文

把散落的 `console.log/warn/error` 逐步收敛到统一 logger，至少支持：

- `service`、`level`、`event`、`timestamp`
- `requestId`、`terminalId`、`sessionId`、`launchId`（存在时）
- 错误类型和可操作原因

不记录 token、完整用户输入或不必要的路径敏感信息。健康检查应能区分 API 存活、terminal server 存活、PTY 数量和恢复状态。

### 10. 修正文档入口和产品描述

已新增：

- [`AGENTS.md`](../AGENTS.md)：给编码 Agent 的仓库级操作指引。
- [`PROJECT_STANDARDS.md`](./PROJECT_STANDARDS.md)：工程、测试、协议、UI 和交付规范。

还应持续保持：

- README 不链接不存在的 `CONTRIBUTING.md`。
- 中英文 README 的功能描述一致；若 Pi Web 是可选能力，应明确写成可选而不是主流程依赖。
- 端口、环境变量和默认鉴权行为只维护一个权威来源，并在包 README 里引用它。

## 推荐实施顺序

### 第一阶段：门禁和体积

1. ~~追踪 bundle 构成，拆分 tldraw/xterm/历史面板。~~ 已完成首屏入口、设置弹窗和新增会话弹窗的按需加载；当前首屏预算已通过。
2. ~~扩大根测试范围，建立全量稳定单测命令。~~ 已完成，根 `pnpm test` 覆盖 111 个测试。
3. ~~增加 API task decoder。~~ 已完成 `parseControlTask` 及边界测试。
4. 继续观察懒加载后的画布、终端首次打开耗时，并补充浏览器回归。

### 第二阶段：边界和竞态

1. ~~任务同步取消、generation 和过期响应保护。~~ `useTasks` 已完成第一阶段；继续覆盖 terminal client 和 board reconciliation。
2. ~~`src` 本地 JSON 读写和结构校验统一。~~ 已完成；不维护历史迁移链，破坏性 schema 变更使用新 key。
3. 拆分 package 内 appearance/window 持久化与 board serializer/commands，减少 UI 模块反向依赖。
4. 增加跨层 lifecycle、重连和过期响应测试。

### 第三阶段：长期治理

1. 已接入 `check:type`、`check:test`、`check:build`、`check:bundle` 和 `check:all`，并新增 GitHub Actions 检查工作流；lint/format 仍待按项目风格引入。
2. 统一结构化日志和诊断信息。
3. 建立依赖升级、性能预算和架构文档的变更检查。
4. 将本路线图中的已完成项转为测试和架构契约，避免计划文档成为过期清单。

## 不建议现在做的事

- 不在没有 bundle 分析前大规模重写组件或引入新的状态管理框架。
- 不把所有 Zustand store 合并成单一全局 store。
- 不为了“统一”而把 provider 适配器、PTY 管理和 UI 逻辑抽到一个跨层包。
- 不通过提高性能阈值、关闭测试或吞掉错误来获得表面上的绿色构建。
