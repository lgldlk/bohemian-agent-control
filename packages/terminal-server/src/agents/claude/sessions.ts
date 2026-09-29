import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { advanceJournal, type TurnCursor } from '../journal';
import type { SessionHeader } from '../sessionMatch';

export function claudeProjectDir(cwd: string): string {
  return path.join(process.env.HOME || '', '.claude', 'projects', cwd.replace(/[^a-zA-Z0-9]/g, '-'));
}

export async function listClaudeSessionHeaders(cwd: string): Promise<SessionHeader[]> {
  if (!cwd) return [];
  let names: string[] = [];
  try {
    names = await fs.readdir(claudeProjectDir(cwd));
  } catch {
    return [];
  }
  const headers: SessionHeader[] = [];
  for (const name of names) {
    if (!name.endsWith('.jsonl')) continue;
    const id = name.slice(0, -'.jsonl'.length);
    if (!/^[0-9a-f-]{36}$/i.test(id)) continue;
    try {
      const stat = await fs.stat(path.join(claudeProjectDir(cwd), name));
      const startedAt = Number.isFinite(stat.birthtimeMs) && stat.birthtimeMs > 0 ? stat.birthtimeMs : stat.mtimeMs;
      headers.push({ id, startedAt });
    } catch {
      // A session file can disappear between listing and stat.
    }
  }
  return headers;
}

export async function advanceClaudeSession(cursor: TurnCursor, cwd: string, sessionId: string): Promise<boolean> {
  if (!cwd || !sessionId) return false;
  const file = cursor.path ?? path.join(claudeProjectDir(cwd), `${sessionId}.jsonl`);
  return advanceJournal(cursor, file, applyClaudeSessionLine);
}

/** A user prompt opens the turn. `turn_duration` closes it even when hooks were skipped. */
export function applyClaudeSessionLine(cursor: Pick<TurnCursor, 'phase' | 'observedAt'>, line: string): boolean {
  let row: { type?: string; subtype?: string; isMeta?: boolean; timestamp?: string; message?: { content?: unknown } };
  try {
    row = JSON.parse(line) as { type?: string; subtype?: string; isMeta?: boolean; timestamp?: string; message?: { content?: unknown } };
  } catch {
    return false;
  }
  const observedAt = Date.parse(row.timestamp || '') || Date.now();
  if (row.type === 'system' && row.subtype === 'turn_duration') {
    if (cursor.phase === 'done' && cursor.observedAt === observedAt) return false;
    cursor.phase = 'done';
    cursor.observedAt = observedAt;
    return true;
  }
  if (row.type !== 'user' || row.isMeta === true) return false;
  const content = row.message?.content;
  const text = typeof content === 'string' ? content : JSON.stringify(content ?? '');
  if (!text.trim()) return false;
  if (cursor.phase === 'working' && cursor.observedAt === observedAt) return false;
  cursor.phase = 'working';
  cursor.observedAt = observedAt;
  return true;
}

/** Claude paints a verb plus a timer, like `Simmering… (3m 38s)`, only while a turn is open. */
export function claudeScreenPhase(data: string): 'working' | 'done' | null {
  if (/[A-Za-z]…\s*\(\d/.test(data) || /[A-Za-z]\.\.\.\s*\(\d/.test(data)) return 'working';
  if (data.includes('Worked for ') || data.includes('bypass permissions') || data.includes('Welcome back!')) return 'done';
  return null;
}
