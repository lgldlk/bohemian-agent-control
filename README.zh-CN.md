# Bohemian Agent Control

中文 | [English](./README.md)

> *"人生而自由，却无往不在枷锁之中。"* —— 卢梭
>
> *"Man is born free, and everywhere he is in chains."*

一个画布，容纳所有 AI Agent。Codex、Claude Code、Pi 以及任何 CLI Agent 并肩运行——自由地开启终端，随手关闭，所有会话状态一目了然，无需切换窗口。

一个画布就是 all in all。这就是自由，这就是浪漫。

---

## 为什么选择 Bohemian？

不同的 AI 工具意味着不同的软件、不同的终端、无休止的上下文切换。Bohemian 把它们全部汇聚到一起：

- **所有 Agent，一个画布** — Codex、Claude Code、Pi……并肩运行
- **自由增删** — 一键开启 Agent 终端，随手即可关闭
- **统览全局** — 所有运行中的会话状态尽收眼底
- **零切换** — 不再奔波于窗口之间，专注不被打断

---

## 快速开始

```bash
pnpm install
./scripts/dev-all.sh
```

访问 [http://localhost:18720](http://localhost:18720)

---

## 功能特性

**可视化画布**
每个 Agent 会话都是一个节点，节点之间自由连线，拖拽组织你的工作空间。

**集成终端**
原生终端体验：WebGL 加速渲染、会话持久化、实时流式输出。随时添加、随时移除终端。

**Pi Web 代理**
无缝集成本地运行的 pi-web 会话。

---

## 文档

- [项目开发规范](./docs/PROJECT_STANDARDS.md)
- [优化建议与路线图](./docs/OPTIMIZATION_ROADMAP.md)
- [架构设计](./analysis/bohemian-agent-control-architecture-design.md)
- [实施路线图](./analysis/bohemian-agent-control-terminal-roadmap.md)
- [终端功能](./README.terminal.md)

---

## 贡献

提交改动前请阅读[项目开发规范](./docs/PROJECT_STANDARDS.md)和仓库级 [Agent 指引](./AGENTS.md)。

---

## 开源协议

MIT
