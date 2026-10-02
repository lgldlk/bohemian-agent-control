# Bohemian Agent Control

[中文](./README.zh-CN.md) | English

> *"Man is born free, and everywhere he is in chains."* — Jean-Jacques Rousseau

One canvas, every AI agent. Run Codex, Claude Code, Pi, and any other CLI agent side by side — spin up terminals freely, dismiss them at will, and watch every session at a glance without ever switching windows.

One canvas is all in all. That is freedom. That is romance.

---

## Why Bohemian?

Different AI tools mean different apps, different terminals, constant context switching. Bohemian brings them all together:

- **Every Agent, One Canvas** — Codex, Claude Code, Pi… all running side by side
- **Add & Remove Freely** — open an agent terminal in a click, close it just as fast
- **Full Visibility** — every running session's state at a glance
- **Zero Context Switching** — no window hopping, no lost focus

---

## Quick Start

```bash
pnpm install
pnpm dev
```

Visit [http://localhost:18720](http://localhost:18720)

---

## Features

**Visual Canvas**
Nodes for every agent session, connections between them, drag to organize your workspace.

**Integrated Terminals**
Native terminal experience with WebGL-accelerated rendering, session persistence, and real-time streaming. Add or remove terminals on the fly.

**Unified Agent History**
Reads local Pi, Codex, and Claude Code sessions through their official runtime interfaces. Pi Web is optional; the control center does not depend on it for history.

---

## Documentation

- [Project standards](./docs/PROJECT_STANDARDS.md)
- [Optimization roadmap](./docs/OPTIMIZATION_ROADMAP.md)
- [Architecture](./analysis/bohemian-agent-control-architecture-design.md)
- [Implementation Roadmap](./analysis/bohemian-agent-control-terminal-roadmap.md)
- [Terminal Features](./README.terminal.md)

---

## Contributing

Please read the [project standards](./docs/PROJECT_STANDARDS.md) and the repository [Agent guide](./AGENTS.md) before making changes.

---

## License

MIT
