# Terminal Rendering Architecture

This contract follows the rendering model used by Orca's terminal pane.

## Rendering State

A terminal render has four independent states:

1. PTY delivery state: queued, in-flight, parsed, acknowledged, dropped.
2. Emulator state: xterm normal buffer, xterm alternate buffer, active modes, cursor, dimensions.
3. Viewport intent: following output or pinned to a user-selected scroll position.
4. Presentation state: visible, hidden, parked, fitting, replaying, or recovering.

No one state may be inferred from another. In particular:

- `alternateScreen` describes the PTY program. The board scrollbar is xterm's normal-buffer history, so presentation drops alternate-screen switches and CSI 3 J before xterm parses them.
- A pinned viewport must not be forced to the bottom because output arrived.
- A resize or replay must not replace a user's scroll intent with a numeric line captured before reflow.
- A scrollbar is an emulator/buffer result, not a CSS decoration.

## Output Pipeline

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

Visible output is high priority, but draining remains cooperative. A drain has a byte/chunk/time budget and yields to input and paint. Background terminals use a slower cadence. No component writes directly to xterm outside this pipeline.

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

Presentation removes `ESC[?1049h`, `ESC[?1049l`, `ESC[?1047h`, `ESC[?1047l`, `ESC[?47h`, `ESC[?47l`, and `ESC[3J` before xterm parses them. Those controls either hide the normal buffer or erase its history, which removes the scrollbar. The PTY process still receives the original controls. Drawing bytes, including cursor addressing, are left intact.

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
- TUI mouse tracking may transform wheel distance into replayed line-mode mouse reports, with a replay marker to prevent recursion.

Wheel policy must not be coupled to Agent identity, launch state, hydration, or scrollback persistence.

Selection uses xterm's own cell coordinate system. CSS transforms and fit changes require coordinate correction, but selection must not write directly to private selection internals as a replacement for xterm's selection service.

## Current Gaps

The current implementation still needs these boundaries:

- `Terminal.tsx` still owns the queue instead of a reusable output scheduler with explicit parse-credit lifecycle.
- The server now tracks buffer mode and splits normal history from the current alternate frame in snapshots, but it does not yet serialize a full headless styled buffer like Orca's authoritative model.
- Fit restores a numeric viewport line only as a fallback; it lacks Orca's logical markers and bounded reflow retries.
- Live writes and snapshot replay both pass through `terminalScreenPolicy.ts`, so alternate-screen switches and CSI 3 J never reach xterm. The old rendered-text cache stays off this path.

## Implementation Order

1. Add a terminal render controller that owns queue, budget, parse completion, ACKs, and output ordering.
2. Add scroll-intent capture/restore around live writes, fit, hydration, and replay.
3. Extend the server snapshot contract with `alternateScreen`, normal history ANSI, and alternate frame ANSI.
4. Replace alternate-screen filtering with explicit replay choreography.
5. Make resize/replay use authoritative dimensions and post-fit restoration.
6. Move wheel and selection behavior behind independent adapters after the emulator path is stable.

Until these slices land, terminal scrolling/rendering changes must not be made as isolated CSS or event-handler patches.
