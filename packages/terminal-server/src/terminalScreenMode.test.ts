import { describe, expect, it } from 'vitest';
import { createTerminalBufferModel, createTerminalBufferModeTracker } from './terminalScreenMode';

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
});
