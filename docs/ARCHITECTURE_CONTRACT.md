# Architecture Contract

## Layers

```text
packages/agent-protocol
  Agent adapters, session DTOs and provider-facing lifecycle data

packages/terminal-protocol
  Terminal wire contracts, binary output frames, credit ACKs and normalized Agent status

packages/api-server
  Read-only Agent/session discovery and filesystem browsing

packages/terminal-server
  PTY ownership, startup execution, output buffering, stream backpressure and recovery

packages/terminal-client
  One WebSocket transport, request RPC for control operations, one-way input and ACK frames

src/domain
  Pure frontend reconciliation rules and lifecycle matching

src/hooks
  React orchestration controllers and polling bridges

src/space
  User-owned grouping and workspace membership

src/board
  tldraw projection and terminal shape integration

packages/terminal-ui
  xterm lifecycle, render scheduling, hydration and terminal controls
```

## Agent Launch Flow

Only `useAgentLaunchController` owns the frontend launch flow:

```text
start request
  -> add pending thread
  -> add pending id to space group
  -> project pending task card
  -> wait for task card projection
  -> create PTY with startup plan
  -> create terminal shape beside task card
  -> terminal inventory binds launchId to agentSessionId
  -> rewrite the existing task card and terminal shape in place
  -> then replace the pending space id
  -> API task snapshot fills model, messages, and activity
```

`App` renders state and delegates launch. `useBoardOperations` only handles dropping an existing task onto the board. `terminalActivity` only projects terminal state; it must not mutate workspace or space stores.

## Agent Phase

`projectCardStatus` is the only join. Cards, lamps, icons, and stats read its `task`, `terminal`, and `active` fields. They do not combine the raw inputs themselves.

```text
running    the Agent reports a task in progress
blocked    the agent is waiting on the user
starting   process is starting
idle       no task is in progress; the terminal may still be open
completed  no terminal is running
deleted    tombstone
error      failed, and the process is not up
```

Opening a terminal is not `running`. `running` means a task is being made. PTY exit is completed, not deletion. Only `boundSessionId` is attached to a card, so a launch id or a stale node id cannot mark another card.

## Agent Status Bridge

The status authority is event-driven, following pi-web's provider-hook model:

```text
Pi before_agent_start / agent_start / tool event
  -> working
Pi tool_approval_requested
  -> waiting / blocked
Pi agent_settled / final agent_end
  -> done / idle
  -> WebSocket agent-status with terminalId + launchToken + providerSessionId
  -> PTYManager validates launchToken and emits terminal updated
  -> terminalActivity normalizes the hook state
  -> projectCardStatus renders the card
```

`ps`, PTY liveness, and `/api/sessions` are correlation and fallback signals only. They cannot create task `running`; an open terminal is a terminal fact, not task activity. The terminal server installs the Pi bridge into its own runtime directory and injects it with `--extension`. Claude receives a project-runtime `--settings` file with managed lifecycle hooks. Codex receives a project-runtime `CODEX_HOME` overlay with managed `hooks.json`; user configuration is mirrored without rewriting the user's home. Board-launched Codex terminals use `--no-daemon` because the managed runtime path is not guaranteed to fit the platform's Unix socket path limit. Codex hook trust remains explicit and is never bypassed automatically. A pending Codex PTY binds to the rollout session created in that working directory the same way Pi binds from session headers, so the launch card can be rewritten before hook events arrive. Codex turn state comes from that rollout: `task_started` is working and `task_complete` is idle. Hook events still win when they are newer. When a provider changes the active session inside an existing PTY, that provider session becomes the terminal's active topic identity. Pi `session_start`, Claude Code `SessionStart` (`startup`, `resume`, `clear`, or `fork`), and Codex `SessionStart` (`startup`, `resume`, or `clear`) explicitly authorize the identity switch; `compact` and late stop/end events do not. The card and terminal shape are rebound to the new or resumed topic, stale title, model, usage, and task status are cleared until the API snapshot arrives, and an already-present resumed card is reused instead of duplicated. Opening the terminal does not create `running`.



- API session state is server-owned and read through `useTasks`.
- Pending launches are workspace-owned and live in `workspaceStore`.
- Groups are user-owned and live in `spaceStore`.
- PTY and terminal identity are terminal-server-owned.
- tldraw shapes are a projection, not the source of Agent identity. A launch card is rewritten in place from `launchId` to `agentSessionId` before the space id changes.
- A missing PTY is not an Agent deletion. Deleted Agents are represented by a `deleted` task tombstone.

## Terminal Contract

- Input is a one-way WebSocket frame and is accepted only for the current terminal owner.
- Output is a binary frame with source byte ranges, PTY incarnation, connection generation and delivery token.
- ACKs are batched and only release already-sent source ranges.
- A stream has a per-terminal window and a connection-wide window.
- Snapshot restore is authoritative for the visible screen. Rendered normal-buffer scrollback is owned by `terminalScrollbackCache` and is restored above that screen across hydration/remount.
- Wheel input is owned only by `terminalWheel`. It scrolls the local normal
  buffer; while an alternate-screen TUI is active it uses the TUI mouse
  protocol when tracking is enabled and PageUp/PageDown otherwise. It must not
  become arrow keys or consult Agent state.
- Process liveness, TUI activity, and session records are separate axes in `resolveStatusAxes`. UI lamps must render the axes that were observed. A live process is not TUI working, and a pending record is not process state.
- Reopening or restarting an exited bound Agent terminal must derive the provider resume command from its bound session id. It must resume that conversation rather than start a new one.
- A reconnect must never reuse an old delivery token or incarnation.

## Forbidden Coupling

- UI components must not call `useSpaceStore.getState()` to reconcile Agent lifecycle.
- `App.tsx` must not hardcode plugin ids, plugin page ids, plugin-specific views or plugin rendering branches; page contributions are discovered and rendered by the plugin host.
- Terminal transport code must not modify board shapes.
- Wheel handling must not be inlined into Agent launch, card binding, or terminal hydration.
- Board shape removal must not imply Agent session deletion.
- Provider-specific hook payloads must be normalized before entering terminal state.
- Fixed delays must not be used as shell readiness barriers.

## Change Checklist

When adding an Agent provider:

1. Add provider DTO/adapter in `packages/agent-protocol`.
2. Add hook normalization in `packages/terminal-protocol`.
3. Pass launch identity through `TerminalCreateOptions`.
4. Keep provider session matching in the launch controller/reconciliation layer.
5. Add lifecycle and reconnect tests.

When changing terminal transport:

1. Update `terminal-protocol` first.
2. Update server ownership and stream accounting.
3. Update client frame decoding/encoding.
4. Update xterm hydration and ACK handling.
5. Test stale generation, stale token, reconnect and backlog behavior.
