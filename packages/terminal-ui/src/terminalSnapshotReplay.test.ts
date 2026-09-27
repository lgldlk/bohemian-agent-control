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
    })).toBe('shell\r\n\u001b[?1049hTUI frame\u001b[3J');
  });

  it('leaves normal snapshots unchanged', () => {
    expect(buildTerminalSnapshotReplay({ ...base, data: 'shell\u001b[3J' })).toBe('shell\u001b[3J');
  });
});
