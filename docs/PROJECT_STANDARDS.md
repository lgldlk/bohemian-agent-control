# 项目开发规范

> 本文是 Bohemian Agent Control 的工程规范。它描述当前代码库应遵守的边界，也作为后续引入 CI、lint、格式化和贡献流程的基线。

## 1. 目标与范围

项目目标是把本地多个 AI Agent 的会话、终端和状态投影到统一画布，同时保持终端交互的低延迟、可恢复和可诊断。

规范覆盖：

- 根应用 `src/`
- workspace packages `packages/*`
- API、PTY、WebSocket、tldraw、xterm 和本地持久化
- 测试、构建、性能门禁和文档维护

`analysis/` 与 `reference/` 只用于设计研究和参考，不是生产依赖。除非需求明确，不得从中导入代码或把其临时实现当作项目契约。

## 2. 技术和包管理

- 使用 TypeScript strict mode；新代码禁止通过 `any` 绕过边界类型。
- 使用 React 19、Vite、Zustand、tldraw、xterm 和 Vitest 的既有模式。
- 使用 pnpm workspace；`package.json` 的 `packageManager` 是唯一包管理约定。
- 不新增 `package-lock.json` 或 yarn lock；依赖升级必须说明用途、体积影响和兼容风险。
- 包之间通过 workspace package 的公开 exports 通信，不从其他 package 的 `src` 私有路径导入。
- `agent-protocol` 和 `terminal-protocol` 是契约层，不能依赖 React、tldraw 或具体 UI。

## 3. 目录和职责

| 目录 | 责任 | 不应承担的责任 |
|---|---|---|
| `src/domain` | 纯函数、匹配、合并、状态规则 | React 副作用、直接网络请求 |
| `src/hooks` | React 生命周期、轮询、流程编排 | 重新定义协议或持久化格式 |
| `src/space` | 用户分组和归属 | Agent 运行状态 |
| `src/workspace` | pending launch、最近目录和工作区偏好 | PTY 所有权 |
| `src/board` | 画板投影、节点和终端集成 | 解析 Agent 原始历史 |
| `packages/agent-protocol` | Agent DTO、命令、适配器契约 | provider 的 UI 细节 |
| `packages/terminal-protocol` | wire contract、帧和状态归一化 | socket 生命周期和 DOM |
| `packages/api-server` | Agent 发现和 HTTP 读取接口 | 终端渲染、画板操作 |
| `packages/terminal-server` | PTY、tmux、输出、恢复 | 修改前端 store |
| `packages/terminal-client` | WebSocket 连接和传输 | 决定任务业务状态 |
| `packages/terminal-ui` | xterm 和终端交互体验 | Agent 适配器和 API 请求 |
| `packages/terminal-canvas` | 终端画布窗口 | 任务生命周期编排 |

## 4. 状态所有权和生命周期

修改状态前必须回答“谁拥有这个事实”。

- 服务端 session/Agent 历史：API server。
- PTY、终端身份、连接世代和输出游标：terminal server/protocol。
- pending launch：`workspaceStore`。
- 用户分组：`spaceStore`。
- pin、wire 和画布布局：`boardStore`。
- 卡片上的综合状态：`projectCardStatus` 的投影结果。

启动流程必须保持：

```text
start request
  -> pending thread
  -> space group
  -> pending task card
  -> PTY startup plan
  -> terminal shape
  -> launch id 与真实 session id 绑定
  -> 原地更新 task card / terminal shape
```

约束：

- 终端打开不代表任务 running。
- PTY 退出不自动代表 Agent 被删除。
- 删除任务通过 tombstone 表达，不能用“当前列表里没有”直接推断。
- terminal activity 只能做投影，不得反向修改 workspace 或 space。
- tldraw shape 是视图投影，不是 session identity 的来源。

## 5. 类型、输入和错误处理

- 外部 JSON、WebSocket 消息、localStorage、子进程输出和第三方 SDK 都属于不可信输入，进入领域逻辑前必须做运行时校验和归一化。
- 用 discriminated union 表示协议消息和状态；不要用宽泛字符串在多层传播未定义状态。
- `Date`、路径、任务 id 和 token 的转换集中在边界层完成，内部使用稳定类型。
- 异步请求要处理 HTTP 非 2xx、JSON 格式错误、Abort、重复请求、过期响应和组件卸载。
- 用户可见错误要说明可执行的下一步；日志错误要包含上下文但隐藏凭据和敏感输入。
- 不用空 catch 吞掉关键错误。可以忽略可选持久化失败，但要保持主流程可用并在必要时记录 debug/warn。

## 6. React 和 UI

- 页面组件负责组合；复杂副作用进入 hook 或 domain/controller。
- 组件不要读取其他 store 的 `getState()` 来重建业务生命周期。
- 长列表、终端输出和 tldraw 更新必须避免无意义的全量重渲染；优先订阅最小状态、使用稳定引用和批量更新。
- 交互控件要有明确的 loading、empty、error、disabled、reconnecting 和 destroyed 状态。
- 使用现有像素风和 i18n 体系；用户可见文案不要散落成无法翻译的硬编码。
- 图标按钮使用现有 `lucide-react` 图标，并提供可访问名称或 tooltip；避免把熟悉图标包成多余的文本圆角按钮。
- 不为页面增加装饰性卡片或与当前产品不符的营销区块；终端、画布和任务列表优先考虑扫描效率、密度和可恢复操作。

## 7. 协议、API 和 Agent provider

新增或修改 Agent provider：

1. 先定义 `agent-protocol` 中的 DTO、状态和 id 语义。
2. 在 adapter 中通过官方运行时或稳定接口读取，不复制解析历史文件的逻辑。
3. 在 registry 注册并覆盖空目录、坏数据、超时、不可用 CLI 和 session 匹配。
4. 若支持启动，贯穿 launch id、session id、provider session id 和 terminal identity。
5. 更新 API README、架构契约和测试。

修改终端协议：

1. 先更新 `terminal-protocol`。
2. 再更新 server 所有权/背压。
3. 再更新 client 编解码和 pending request。
4. 最后更新 UI hydration、scrollback、ACK 和重连。
5. 至少覆盖旧连接消息、旧 delivery token、旧 incarnation、重连 backlog 和退出恢复。

## 8. 本地持久化

- 每个 storage key 必须包含产品前缀和当前 schema 标识，例如 `bohemian-agent-control:space:v2`。
- 读取 localStorage 必须校验结构，不能直接把 `JSON.parse` 结果断言成业务类型。
- 本项目是新项目，不维护历史 schema 的迁移链；破坏性 schema 变更直接使用新的 key/schema 标识，并以安全默认值启动。
- 持久化不应阻塞主交互；失败时不影响内存态主流程。
- 新增多个持久化 store 时优先复用统一的 JSON 读写、decoder 和错误策略，避免各自实现不同的容错规则。

## 9. 测试策略

按行为边界测试，不只按实现分支测试：

- domain/protocol：纯输入输出测试和边界值。
- API/provider：适配器归一化、缺失文件、坏数据、缓存失效和错误。
- terminal-server/client：鉴权、所有权、帧序列、背压、重连和恢复。
- terminal-ui：滚动意图、快照回放、选择、粘贴、窗口布局和渲染调度。
- frontend orchestration：pending 到 bound、tombstone、分组重绑和过期响应。

标准命令：

```bash
pnpm test
pnpm build
pnpm perf:bundle
pnpm check:all
```

当前根 `pnpm test` 覆盖 protocol、terminal-server、api-server、terminal-ui 和 `src` 下的稳定测试。任何新增测试范围都应补进根脚本或 CI，避免测试存在但默认不执行。跨模块改动还应执行 `pnpm check:all`。

## 10. 性能与可靠性

- 首屏资源、终端输出和画布更新都要有可测预算。
- 影响依赖、动态 import、manualChunks 或 terminal UI 的改动必须运行 `pnpm perf:bundle`。
- 不能通过放宽性能阈值隐藏回归。
- 轮询、心跳、重连和 debounce 必须在卸载时清理；后台标签页应降低无必要工作。
- 首屏优先加载工作区骨架和任务概览，tldraw、终端 UI、历史面板等重模块按需加载。
- 关键服务应保持健康检查；错误日志需要可关联到请求、terminal id、session id 或 launch id。

## 11. 文档规范

- 新增行为契约先更新 `docs/ARCHITECTURE_CONTRACT.md` 或对应专题文档。
- README 只写安装、运行、功能和入口；实现细节放 `docs/`。
- 端口、环境变量、包命令和默认行为变化必须同步更新 README 与包级 README。
- 文档中的命令应能在仓库根目录执行；链接不得指向不存在的文件。
- 参考资料要标注为参考，不得让读者误以为是当前实现。

## 12. 交付清单

- [ ] 明确改动所属层和状态所有权。
- [ ] 更新类型/协议/持久化版本及对应文档。
- [ ] 补充受影响边界的测试。
- [ ] 执行相关包测试、`pnpm build` 和必要的性能检查。
- [ ] 检查日志、token、路径和用户输入没有泄漏。
- [ ] 检查 README 和文档链接有效，未引入无关格式化或构建产物。
