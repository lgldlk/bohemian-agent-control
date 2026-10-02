# Terminal Rendering Architecture

This contract follows the rendering model used by Orca's terminal pane.

## Rendering State

A terminal render has four independent states:

1. PTY delivery state: queued, in-flight, parsed, acknowledged, dropped.
2. Emulator state: xterm normal buffer, xterm alternate buffer, active modes, cursor, dimensions.
3. Viewport intent: following output or pinned to a user-selected scroll position.
4. Presentation state: visible, hidden, parked, fitting, replaying, or recovering.

No one state may be inferred from another. In particular:

- `alternateScreen` describes the PTY program. xterm renders that program on the alternate buffer, as Orca does. The board scrollbar is the normal buffer and returns when the program leaves the alternate screen.
- A pinned viewport must not be forced to the bottom because output arrived.
- A resize or replay must not replace a user's scroll intent with a numeric line captured before reflow.
- A scrollbar is an emulator/buffer result, not a CSS decoration.

## Presentation Policy

Canvas terminals use three presentation states derived from tldraw visibility, camera zoom, physical size, document visibility, parking, and focus:

- `hot`: the focused visible terminal. It receives the highest scheduler priority and may hold a WebGL lease.
- `warm`: a visible background terminal. It keeps the emulator available but is lower priority than hot output.
- `cold`: a culled, hidden, parked, or too-small terminal. Its output attachment is detached and local rendering is suspended; PTY execution and server snapshot capture continue. When it returns, a fresh output attachment is established before snapshot hydration.

The policy is implemented in `terminalPresentation.ts`. It must not change PTY or Agent identity. tldraw may keep a culled HTML shape mounted with `display: none`; the presentation policy still has to suspend its terminal output work. WebGL is leased globally and is limited to a small number of hot terminals. Terminals without a lease use xterm's DOM renderer.


Live output follows one pipeline:

```text
PTY frame
  -> bounded per-terminal queue
  -> cooperative drain budget
  -> xterm.write
  -> parser completion callback
  -> ACK / next drain
```

The queue owns ordering and backpressure. The renderer owns parsing and paint. ACKs are released after xterm has accepted and parsed the bytes, not when the WebSocket frame merely arrives. Dropped or discarded chunks must release their ACK credits too.

The output queue, cooperative drain, parser-completion ACKs, and backlog accounting are owned by `TerminalRenderController`. `Terminal.tsx` supplies the xterm write callback and scroll-intent hooks; it does not own a second output queue.


## Scroll Intent

Before structural operations, capture:

- active buffer type;
- whether the viewport follows the bottom;
- viewport line and base line;
- a logical line marker when the buffer can reflow.

After output, replay, fit, remount, or resize:

- if the user was following output, scroll to bottom;
- if the user was pinned, restore the logical line after reflow;
- do not restore if the user issued a newer scroll gesture;
- retry restoration after xterm dimensions become measurable;
- force a scrollbar sync when xterm's `ydisp` changed but its native thumb stayed stale.

The live output path does not blindly call `scrollToBottom`. xterm's follow/pin state is authoritative; application code only restores intent across structural operations.

## Alternate Screen

Alternate-screen programs are rendered as alternate-screen programs.

For a snapshot containing both history and an alternate frame, the authoritative payload is split:

```text
normal prologue
  -> normal scrollback ANSI
  -> alternate-screen prologue
  -> alternate frame ANSI
  -> post-replay mode reset
  -> pending escape tail
```

Live bytes, including `ESC[?1049h`, `ESC[?1049l`, and cursor addressing, reach xterm unchanged. tmux keeps `alternate-screen` on and does not clear `smcup`/`rmcup`. Emulating that paint on the normal buffer scrolls a cursor-addressed row that ends in CR LF into history, which leaves a blank gap or stale cells. The glitch is intermittent because only some TUI frames repaint that way.

Nested tmux must not receive xterm.js identity replies as keyboard input. On attach tmux sends the complete identity probe set: DA1 (`CSI c`), DA2 (`CSI > c`), and XTVERSION (`CSI > q`). `terminalQueryPolicy.ts` handles that whole class before xterm's built-in reply handlers, so no CSI/DCS identity response is emitted through `onData`. Kitty keyboard negotiation (`CSI > u`, `CSI ? u`) and ordinary input remain untouched. `terminalOutputSanitizer.ts` only removes identity artifacts from snapshots recorded before this policy existed; it is not the live protocol boundary.

If an alternate-screen frame cannot fit the current width, discard only that fixed-grid frame and let the live TUI repaint after a resize. Keep the normal history and mode choreography.

## Resize and Fit

A fit is a structural operation:

```text
capture scroll intent
  -> resize xterm at authoritative snapshot dimensions when replaying
  -> parse replay
  -> fit actual pane
  -> restore scroll intent after measurable layout
  -> notify PTY of final geometry
```

Do not use a fixed delay as a fit barrier. Use `ResizeObserver`, xterm dimensions, and bounded animation-frame retries.

## Wheel and Selection

Wheel handling has two paths:

- when the normal buffer has history, the wheel and scrollbar scroll that buffer;
- normal terminal scrolling is left to xterm's viewport;
- alternate-screen wheel input is replayed into xterm's mouse protocol when
  the TUI has mouse tracking; PageUp/PageDown is the fallback when it does not.

Wheel policy must not be coupled to Agent identity, launch state, hydration, or scrollback persistence.

Selection uses xterm's own cell coordinate system. CSS transforms and fit changes require coordinate correction, but selection must not write directly to private selection internals as a replacement for xterm's selection service.

`terminalEventBoundary.ts` owns input routing for an embedded terminal. Keyboard, IME, clipboard, pointer, mouse, wheel, touch, selection, and drag/drop events run through xterm and the terminal adapters first, then stop at the terminal boundary before they reach tldraw or page-level shortcuts. The boundary never calls `preventDefault`; only the terminal feature that consumes an event may cancel its browser behavior.

tldraw handles Escape during the capture phase to exit shape editing before xterm's textarea receives it. While a terminal is focused, `terminalKeyInput.ts` forwards plain Escape directly as byte `0x1B` and stops the canvas event.

macOS Cmd/Super modifiers cannot be preserved through tmux: tmux rewrites `CSI 1;9 C/D` as Alt-modified arrows. `terminalKeyInput.ts` therefore maps Cmd+Left/Right to Home/End and Cmd+Up/Down to Ctrl+Home/End, preserving the editing meaning through sequences tmux transports unchanged. Shift variants map to the corresponding selecting navigation sequences.

## Restart, Recovery, and Input Ownership

Terminal identity and terminal input ownership are separate contracts:

- A persistent terminal is reattached by its stable terminal ID and tmux session when that session survived the server restart.
- A bound Pi, Codex, or Claude terminal with a real `agentSessionId` is resumable when its tmux session did not survive; the server starts the provider-specific resume command instead of silently leaving the board shape in an exited state.
- A free shell without an Agent session is not auto-relaunched.
- WebSocket output subscription and input ownership are both restored after reconnect. If a newer canvas connection subscribes with `owner: true`, ownership for that terminal transfers from a stale browser connection only; other terminal streams on the old connection remain untouched.
- A cold-to-visible transition reattaches the output stream and hydrates a fresh snapshot before relying on live frames.
- A terminal component remount starts with no attachment and must resubscribe based on its measured presentation state; it cannot assume an earlier UI attachment still exists.
- Attachment changes are client-scoped. Detaching one view removes only its output subscription; it never pauses a PTY shared by another view or changes Agent process state.
- Output ACK and renderer suspension are independent: detaching releases that connection's stream window; returning attaches again and recovers from the authoritative snapshot.
- A terminal may display a live snapshot while rejecting input only when ownership is stale; this is a transport recovery bug, not an Agent status.

## Current Gaps

The current implementation still needs these boundaries:

- Warm terminals currently share the scheduler's frame budget and need an explicit lower-frequency cadence and fairness metrics.
- The server now tracks buffer mode and splits normal history from the current alternate frame in snapshots, but it does not yet serialize a full headless styled buffer like Orca's authoritative model.
- Hydration now drains output both before and after snapshot parsing, and rendered normal-buffer history is cached across remounts.
- Fit restores a logical line marker when available, with bounded reflow retries; numeric bottom-offset restoration remains the fallback.
- `terminalScreenPolicy.ts` is not on the live write or snapshot path. Wiring it back would drop alternate-screen switches and recreate the garbled normal-buffer paint.
- WebGL leasing is bounded, but renderer mode changes and context-loss recovery still need browser-level performance coverage.
- Development builds expose a terminal performance preview with FPS, frame time, long-frame count, queue bytes, parser time, dropped frames, presentation state, and WebGL/DOM mode. Production builds keep it disabled by default and expose the same toggle through terminal settings.

## Implementation Order

1. ~~Add a terminal render controller that owns queue, budget, parse completion, ACKs, and output ordering.~~
2. ~~Add presentation states for hot, warm, and cold canvas terminals, including bounded WebGL leases.~~
3. Add explicit warm-terminal cadence, fairness scheduling, and runtime render metrics.
4. ~~Add scroll-intent capture/restore around live writes, fit, hydration, and replay.~~
5. Extend the server snapshot contract with `alternateScreen`, normal history ANSI, and alternate frame ANSI.
6. Replace alternate-screen filtering with explicit replay choreography.
7. Make resize/replay use authoritative dimensions and post-fit restoration.
8. Move wheel and selection behavior behind independent adapters after the emulator path is stable.

Until these slices land, terminal scrolling/rendering changes must not be made as isolated CSS or event-handler patches.
