import { describe, expect, it } from 'vitest';
import {
  createTerminalBufferModel,
  createTerminalBufferModeTracker,
  truncateTerminalTail,
} from './terminalScreenMode';

describe('terminal buffer model', () => {
  it('splits normal history from the alternate frame', () => {
    const model = createTerminalBufferModel();
    const first = model.feed('shell\n\u001b[?1049hframe');
    expect(first.normal).toBe('shell\n');
    const frame = model.feed(' more\u001b[?1049l');
    expect(`${first.alternate}${frame.alternate}`).toContain('frame more\u001b[?1049l');
    expect(frame.mode).toBe('normal');
    expect(model.feed('prompt\n').normal).toBe('prompt\n');
  });

  it('handles split control sequences', () => {
    const tracker = createTerminalBufferModeTracker();
    expect(tracker.feed('\u001b[?10')).toBe('normal');
    expect(tracker.feed('49hframe')).toBe('alternate');
  });

  it('does not start a bounded transcript inside a CSI sequence', () => {
    const value = `prefix\n\u001b[31mred\n\u001b[0mnext`;
    const result = truncateTerminalTail(value, 8);
    expect(result).toContain('next');
    expect(result.startsWith('\u001b[0m')).toBe(true);
    expect(result).not.toMatch(/^\u001b\[0m\d+m/);
  });
});
