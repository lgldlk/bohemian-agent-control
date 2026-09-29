import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { advanceJournal, type TurnCursor } from '../journal';
import type { SessionHeader } from '../sessionMatch';

const TURN_OPEN = new Set(['task_started']);
const TURN_CLOSE = new Set(['task_complete', 'turn_aborted', 'task_aborted', 'turn_cancelled', 'task_cancelled']);

export function codexHome(): string {
  return process.env.CODEX_HOME
    || process.env.BOHEMIAN_CODEX_HOME
    || path.join(process.env.HOME || '', '.bohemian-agent-control', 'terminals', 'agent-hooks', 'codex-home');
}

export async function listCodexSessionHeaders(cwd: string): Promise<SessionHeader[]> {
  if (!cwd) return [];
  const headers: SessionHeader[] = [];
  for (const file of await listRecentRolloutFiles(path.join(codexHome(), 'sessions'))) {
    const header = await readCodexSessionHeader(file);
    if (header?.cwd === cwd) headers.push({ id: header.id, startedAt: header.startedAt });
  }
  return headers;
}

export async function advanceCodexTurn(cursor: TurnCursor, sessionId: string): Promise<boolean> {
  if (!sessionId) return false;
  return advanceJournal(cursor, cursor.path ?? await findCodexRollout(sessionId), applyCodexTurnLine);
}

export function applyCodexTurnLine(cursor: Pick<TurnCursor, 'phase' | 'observedAt'>, line: string): boolean {
  if (!TURN_OPEN.has(line.includes('task_started') ? 'task_started' : '') && !line.includes('task_complete') && !line.includes('aborted') && !line.includes('cancelled')) return false;
  let row: { timestamp?: string; type?: string; payload?: { type?: string } };
  try {
    row = JSON.parse(line) as { timestamp?: string; type?: string; payload?: { type?: string } };
  } catch {
    return false;
  }
  const kind = row.type === 'event_msg' ? row.payload?.type : undefined;
  if (!kind || (!TURN_OPEN.has(kind) && !TURN_CLOSE.has(kind))) return false;
  const observedAt = Date.parse(row.timestamp || '') || Date.now();
  const phase = TURN_OPEN.has(kind) ? 'working' : 'done';
  if (cursor.phase === phase && cursor.observedAt === observedAt) return false;
  cursor.phase = phase;
  cursor.observedAt = observedAt;
  return true;
}

/** The later marker in one paint wins, so a prompt return closes an earlier Working line. */
export function codexScreenPhase(data: string): 'working' | 'done' | null {
  const markers: Array<[string, 'working' | 'done']> = [
    ['esc to interrupt', 'working'],
    ['Working (', 'working'],
    ['Ask Codex to do anything', 'done'],
  ];
  let best: { at: number; phase: 'working' | 'done' } | null = null;
  for (const [marker, phase] of markers) {
    const at = data.lastIndexOf(marker);
    if (at >= 0 && (!best || at >= best.at)) best = { at, phase };
  }
  return best?.phase ?? null;
}

async function listRecentRolloutFiles(root: string): Promise<string[]> {
  const dirs = recentDayDirs(root);
  const files: string[] = [];
  for (const dir of dirs) {
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (name.startsWith('rollout-') && name.endsWith('.jsonl')) files.push(path.join(dir, name));
    }
  }
  return files;
}

async function findCodexRollout(sessionId: string): Promise<string | undefined> {
  for (const dir of recentDayDirs(path.join(codexHome(), 'sessions'))) {
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    const name = names.find((entry) => entry.includes(sessionId) && entry.endsWith('.jsonl'));
    if (name) return path.join(dir, name);
  }
  return undefined;
}

function recentDayDirs(root: string): string[] {
  const dirs = new Set<string>();
  const add = (date: Date) => {
    const utc = date.toISOString().slice(0, 10);
    dirs.add(path.join(root, utc.slice(0, 4), utc.slice(5, 7), utc.slice(8, 10)));
    dirs.add(path.join(
      root,
      String(date.getFullYear()),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ));
  };
  const now = new Date();
  for (let offset = 0; offset < 3; offset += 1) add(new Date(now.getTime() - offset * 86_400_000));
  return [...dirs];
}

async function readCodexSessionHeader(file: string): Promise<{ id: string; cwd: string; startedAt: number } | undefined> {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(256 * 1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const newline = buffer.subarray(0, bytesRead).indexOf(10);
    if (newline <= 0) return undefined;
    const line = buffer.subarray(0, newline).toString('utf8');
    if (!line) return undefined;
    const row = JSON.parse(line) as {
      type?: string;
      timestamp?: string;
      payload?: { id?: string; session_id?: string; cwd?: string; timestamp?: string };
    };
    const payload = row.payload ?? {};
    const id = payload.session_id || payload.id;
    const cwd = payload.cwd;
    const startedAt = Date.parse(payload.timestamp || row.timestamp || '');
    if ((row.type && row.type !== 'session_meta') || !id || !cwd || !Number.isFinite(startedAt)) return undefined;
    return { id, cwd, startedAt };
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}
