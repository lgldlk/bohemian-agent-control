export type TerminalBufferMode = 'normal' | 'alternate';

const MODE_SEQUENCES: ReadonlyArray<readonly [string, TerminalBufferMode]> = [
  ['\u001b[?1049h', 'alternate'],
  ['\u001b[?1049l', 'normal'],
  ['\u001b[?1047h', 'alternate'],
  ['\u001b[?1047l', 'normal'],
  ['\u001b[?47h', 'alternate'],
  ['\u001b[?47l', 'normal'],
];

/**
 * Keep a bounded terminal transcript without starting in the middle of an
 * escape sequence or a UTF-16 surrogate pair. A reset prefix makes the
 * truncated tail deterministic when style state came from bytes we dropped.
 */
export function truncateTerminalTail(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  let start = Math.max(0, value.length - Math.max(1, maxChars));
  const newline = value.indexOf('\n', start);
  if (newline >= 0 && newline + 1 < value.length) start = newline + 1;

  const previous = value.lastIndexOf('\u001b', start);
  if (previous >= 0 && previous < start) {
    const marker = value[previous + 1];
    if (marker === '[' || marker === ']' || marker === 'P' || marker === '^' || marker === '_') {
      let end = -1;
      if (marker === '[') {
        for (let index = previous + 2; index < value.length; index += 1) {
          const code = value.charCodeAt(index);
          if (code >= 0x40 && code <= 0x7e) {
            end = index + 1;
            break;
          }
        }
      } else {
        const bel = value.indexOf('\u0007', previous + 2);
        const st = value.indexOf('\u001b\\', previous + 2);
        end = bel >= 0 && (st < 0 || bel < st) ? bel + 1 : st >= 0 ? st + 2 : -1;
      }
      if (end > start) start = end;
    }
  }
  if (start > 0 && start < value.length) {
    const code = value.charCodeAt(start);
    if (code >= 0xdc00 && code <= 0xdfff) start += 1;
  }
  return `\u001b[0m${value.slice(start)}`;
}

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

      normalHistory = truncateTerminalTail(`${normalHistory}${normal}`, maxChars);
      if (alternate.includes('\u001b[?1049h') || alternate.includes('\u001b[?1047h') || alternate.includes('\u001b[?47h')) {
        alternateFrame = truncateTerminalTail(alternate, maxChars);
      } else if (alternate) {
        alternateFrame = truncateTerminalTail(`${alternateFrame}${alternate}`, maxChars);
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
