import type { TerminalOutputFrame } from '@bohemian/terminal-protocol';

/**
 * Drain output that arrived while a snapshot was being fetched or parsed.
 *
 * xterm parses asynchronously, so this must be called again from the parser
 * callback. A single snapshot-time drain leaves a frame stranded forever.
 */
export function drainHydrationOutput(
  frames: readonly TerminalOutputFrame[],
  sequence: number,
  ack: (frame: TerminalOutputFrame) => void,
): TerminalOutputFrame[] {
  const replay: TerminalOutputFrame[] = [];
  for (const frame of frames) {
    if (frame.sequence > sequence) replay.push(frame);
    else ack(frame);
  }
  return replay;
}
