# @bohemian/api-server

控制台 HTTP 后端。前端只打这一层，不直连各 Agent；每个 Agent 的本地历史由独立 adapter 通过官方运行时接口读取。

```
http/routes → AgentRegistry → PiAgentAdapter (Pi SessionManager)
                         ├→ CodexAgentAdapter (codex app-server / stdio)
                         └→ ClaudeCodeAgentAdapter (Claude Agent SDK)
```

## 脚本

```bash
pnpm --filter @bohemian/api-server dev
pnpm --filter @bohemian/api-server test
pnpm --filter @bohemian/api-server typecheck
```

## 环境变量

| 变量 | 默认 | 含义 |
|---|---|---|
| `API_HOST` | `127.0.0.1` | 监听地址 |
| `API_PORT` | `18721` | API 监听端口 |
| `PI_SESSION_DIR` | Pi 默认会话目录 | 可选的 Pi 会话目录覆盖 |
| `CODEX_COMMAND` | `codex` | Codex CLI 可执行文件 |
| `LOG_LEVEL` | `info` | debug / info / warn / error |
| `~/.bohemian-agent-control/api.token` | 自动生成 | 前端代理使用的本机 API token |

API 默认仅监听 `127.0.0.1`。除了 `/api/health` 外的接口都需要 `x-bohemian-token`，Vite 开发代理会自动注入。

Pi、Codex、Claude Code 均可在没有 Pi Web 的情况下被读取。历史文件格式不在本项目中解析：Pi 使用 `SessionManager`，Codex 使用 `codex app-server`，Claude Code 使用官方 Agent SDK。

## 接新 Agent

1. `src/agents/<kind>/XxxAgentAdapter.ts` 实现 `@bohemian/agent-protocol` 的 `AgentAdapter`
2. 在 `src/agents/index.ts` 的 `createDefaultRegistry` 登记
3. 契约类型改 `packages/agent-protocol` 的 `AgentKind` 联合
