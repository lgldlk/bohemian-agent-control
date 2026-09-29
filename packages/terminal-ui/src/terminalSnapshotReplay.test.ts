import { describe, expect, it } from 'vitest';
import { buildTerminalSnapshotReplay } from './terminalSnapshotReplay';

const base = { terminalId: 't', sequence: 1, truncated: false };

describe('terminal snapshot replay', () => {
  it('keeps alternate-screen history and the current frame unchanged', () => {
    expect(buildTerminalSnapshotReplay({
      ...base,
      alternateScreen: true,
      scrollbackAnsi: 'shell\r\n',
      data: '\u001b[?1049hTUI frame\u001b[3J',
    })).toBe('\u001b[?1049l\u001b[0mshell\r\n\u001b[?1049hTUI frame\u001b[3J\u001b[0m');
  });

  it('leaves normal snapshots unchanged', () => {
    expect(buildTerminalSnapshotReplay({ ...base, data: 'shell\u001b[3J' }))
      .toBe('\u001b[?1049l\u001b[0mshell\u001b[3J\u001b[0m');
  });

  it('adds an alternate-screen prologue when older snapshots omit it', () => {
    expect(buildTerminalSnapshotReplay({
      ...base,
      alternateScreen: true,
      scrollbackAnsi: 'shell\r\n',
      data: 'frame',
    })).toBe('\u001b[?1049l\u001b[0mshell\r\n\u001b[?1049hframe\u001b[0m');
  });

  it('does not replay alternate-screen frames from an older TUI session', () => {
    expect(buildTerminalSnapshotReplay({
      ...base,
      alternateScreen: true,
      data: '\u001b[?1049hold frame\u001b[?1049l\u001b[?1049hcurrent frame',
      scrollbackAnsi: 'shell\r\n',
    })).toBe('\u001b[?1049l\u001b[0mshell\r\n\u001b[?1049hcurrent frame\u001b[0m');
  });

  it('clips oversized normal replay at a line boundary', () => {
    const data = `${'old '.repeat(100_000)}\ncurrent`;
    const replay = buildTerminalSnapshotReplay({ ...base, data });
    expect(replay).toContain('current');
    expect(replay.length).toBeLessThan(data.length + 30);
  });
});
