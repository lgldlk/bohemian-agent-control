export type TerminalBufferMode = 'normal' | 'alternate';

const MODE_SEQUENCES: ReadonlyArray<readonly [string, TerminalBufferMode]> = [
  ['\u001b[?1049h', 'alternate'],
  ['\u001b[?1049l', 'normal'],
  ['\u001b[?1047h', 'alternate'],
  ['\u001b[?1047l', 'normal'],
  ['\u001b[?47h', 'alternate'],
  ['\u001b[?47l', 'normal'],
];

export interface TerminalBufferChunk {
  normal: string;
  alternate: string;
  mode: TerminalBufferMode;
}

/** Splits and retains the normal history and the current alternate frame. */
export function createTerminalBufferModel(initial: TerminalBufferMode = 'normal', maxChars = 1_000_000) {
  let mode = initial;
  let pending = '';
  let normalHistory = '';
  let alternateFrame = '';

  return {
    feed(data: string): TerminalBufferChunk {
      const input = pending + data;
      pending = '';
      let normal = '';
      let alternate = '';
      let index = 0;
      while (index < input.length) {
        const escape = input.indexOf('\u001b', index);
        if (escape < 0) {
          if (mode === 'alternate') alternate += input.slice(index);
          else normal += input.slice(index);
          break;
        }
        const before = input.slice(index, escape);
        if (mode === 'alternate') alternate += before;
        else normal += before;
        const rest = input.slice(escape);
        const hit = MODE_SEQUENCES.find(([sequence]) => rest.startsWith(sequence));
        if (hit) {
          alternate += hit[0];
          mode = hit[1];
          index = escape + hit[0].length;
          continue;
        }
        if (rest.length < 12 && MODE_SEQUENCES.some(([sequence]) => sequence.startsWith(rest))) {
          pending = rest;
          break;
        }
        if (mode === 'alternate') alternate += '\u001b';
        else normal += '\u001b';
        index = escape + 1;
      }

      normalHistory = `${normalHistory}${normal}`.slice(-maxChars);
      if (alternate.includes('\u001b[?1049h') || alternate.includes('\u001b[?1047h') || alternate.includes('\u001b[?47h')) {
        alternateFrame = alternate.slice(-maxChars);
      } else if (alternate) {
        alternateFrame = `${alternateFrame}${alternate}`.slice(-maxChars);
      }
      return { normal, alternate, mode };
    },
    getMode(): TerminalBufferMode {
      return mode;
    },
    getNormalHistory(): string {
      return normalHistory;
    },
    getAlternateFrame(): string {
      return alternateFrame;
    },
    reset(next: TerminalBufferMode = 'normal'): void {
      mode = next;
      pending = '';
      normalHistory = '';
      alternateFrame = '';
    },
  };
}

export type TerminalBufferModel = ReturnType<typeof createTerminalBufferModel>;

/** Compatibility helper for mode-only callers. */
export function createTerminalBufferModeTracker(initial: TerminalBufferMode = 'normal') {
  const model = createTerminalBufferModel(initial);
  return {
    feed(data: string): TerminalBufferMode {
      return model.feed(data).mode;
    },
    getMode: () => model.getMode(),
    reset: (next: TerminalBufferMode = 'normal') => model.reset(next),
  };
}
