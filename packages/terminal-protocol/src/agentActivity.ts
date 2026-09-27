import type { TerminalAgentStatus } from './types';

const BRAILLE_RE = /[\u2800-\u28FF]/;
const QUARTER_CIRCLE_RE = /[\u25D0-\u25D3]/;
const WORKING_RE = /(?<![\w./\\-])(thinking|working|running)(?![\w-])/i;
const IDLE_RE = /(?<![\w./\\-])(ready|idle|done)(?![\w-])/i;
const BLOCKED_RE = /\baction required\b|\bpermission\b/i;
const PI_BRAND_RE = /(?:^|[\s|])(?:π|Pi|OMP)(?=\s|$|[:!\->])/u;
const CLAUDE_IDLE = '\u2733'; // ✳
const GEMINI_WORKING = '\u2726'; // ✦
const GEMINI_SILENT = '\u23F2'; // ⏲
const GEMINI_IDLE = '\u25C7'; // ◇
const GEMINI_BLOCKED = '\u270B'; // ✋

export function detectAgentActivity(title: string): TerminalAgentStatus | null {
  const text = title.trim();
  if (!text) return null;
  if (BRAILLE_RE.test(text) || QUARTER_CIRCLE_RE.test(text)) return 'working';
  if (text.includes(GEMINI_WORKING) || text.includes(GEMINI_SILENT) || text.startsWith('. ')) return 'working';
  if (text.includes(GEMINI_BLOCKED) || BLOCKED_RE.test(text)) return 'blocked';
  if (/^(?:π|Pi|OMP)(?:\s+!|:!)/u.test(text)) return 'blocked';
  if (text.includes(GEMINI_IDLE) || text.startsWith(CLAUDE_IDLE) || text.startsWith('* ')) return 'idle';
  if (WORKING_RE.test(text)) return 'working';
  if (IDLE_RE.test(text)) return 'idle';
  if (PI_BRAND_RE.test(text) || /\bclaude\b/i.test(text)) return 'idle';
  return null;
}

export function foldAgentActivity(
  previous: TerminalAgentStatus | undefined,
  detected: TerminalAgentStatus | null,
): TerminalAgentStatus | undefined {
  if (detected) return detected;
  if (previous === 'working') return 'idle';
  return previous;
}

export function mergeAgentActivity(
  current: TerminalAgentStatus | undefined,
  next: TerminalAgentStatus,
): TerminalAgentStatus {
  const rank = { working: 3, blocked: 2, idle: 1 };
  if (!current) return next;
  return rank[next] >= rank[current] ? next : current;
}

/** Extract OSC 0/1/2 window titles from a PTY chunk stream. */
export function createOscTitleParser(): (chunk: string) => string[] {
  let pending = '';
  return (chunk: string): string[] => {
    const data = pending + chunk;
    pending = '';
    const titles: string[] = [];
    let index = 0;
    while (index < data.length) {
      const start = data.indexOf('\x1b]', index);
      if (start < 0) break;
      const kind = data[start + 2];
      if ((kind !== '0' && kind !== '1' && kind !== '2') || data[start + 3] !== ';') {
        index = start + 2;
        continue;
      }
      const body = start + 4;
      const bel = data.indexOf('\x07', body);
      const st = data.indexOf('\x1b\\', body);
      let end = -1;
      let skip = 0;
      if (bel >= 0 && (st < 0 || bel < st)) {
        end = bel;
        skip = 1;
      } else if (st >= 0) {
        end = st;
        skip = 2;
      }
      if (end < 0) {
        pending = data.slice(start);
        if (pending.length > 8192) pending = '';
        break;
      }
      titles.push(data.slice(body, end));
      index = end + skip;
    }
    return titles;
  };
}
