import { describe, expect, it, vi } from 'vitest';
import type { TerminalOutputFrame } from '@bohemian/terminal-protocol';
import { drainHydrationOutput } from './terminalHydration';

function frame(sequence: number): TerminalOutputFrame {
  return {
    terminalId: 'terminal-1',
    data: `frame-${sequence}`,
    sequence,
    bytes: 1,
    sourceStart: sequence,
    sourceEnd: sequence + 1,
    connectionGeneration: 'generation-1',
    deliveryToken: `token-${sequence}`,
    incarnationId: 'incarnation-1',
    foreground: true,
  };
}

describe('terminal hydration output', () => {
  it('keeps only frames newer than the snapshot and ACKs stale frames', () => {
    const ack = vi.fn();
    const result = drainHydrationOutput([frame(3), frame(4), frame(5)], 4, ack);
    expect(result.map((item) => item.sequence)).toEqual([5]);
    expect(ack).toHaveBeenCalledWith(frame(3));
    expect(ack).toHaveBeenCalledWith(frame(4));
  });
});
