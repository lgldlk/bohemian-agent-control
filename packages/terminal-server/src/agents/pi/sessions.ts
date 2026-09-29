import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { advanceJournal, type TurnCursor } from '../journal';
import type { SessionHeader } from '../sessionMatch';

export async function listPiSessionHeaders(cwd: string): Promise<SessionHeader[]> {
  if (!cwd) return [];
  const root = path.join(process.env.HOME || '', '.pi', 'agent', 'sessions', `-${cwd.replaceAll('/', '-')}--`);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const headers: SessionHeader[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue;
      const header = await readPiSessionHeader(path.join(root, entry.name));
      if (header?.cwd === cwd) headers.push({ id: header.id, startedAt: header.startedAt });
    }
    return headers;
  } catch {
    return [];
  }
}

export async function advancePiSession(cursor: TurnCursor, cwd: string, sessionId: string): Promise<boolean> {
  if (!cwd || !sessionId) return false;
  const file = cursor.path ?? await findPiSessionFile(cwd, sessionId);
  return advanceJournal(cursor, file, applyPiSessionLine);
}

/** A user or tool result opens the turn. An assistant `stop` or `aborted` closes it. */
export function applyPiSessionLine(cursor: Pick<TurnCursor, 'phase' | 'observedAt'>, line: string): boolean {
  let row: { type?: string; timestamp?: string; message?: { role?: string; stopReason?: string; content?: unknown } };
  try {
    row = JSON.parse(line) as { type?: string; timestamp?: string; message?: { role?: string; stopReason?: string; content?: unknown } };
  } catch {
    return false;
  }
  if (row.type !== 'message') return false;
  const role = row.message?.role;
  const observedAt = Date.parse(row.timestamp || '') || Date.now();
  const content = row.message?.content;
  const hasTool = Array.isArray(content) && content.some((item) => {
    const type = item && typeof item === 'object' ? (item as { type?: string }).type : undefined;
    return type === 'toolCall' || type === 'tool_use';
  });
  const stop = row.message?.stopReason;
  const phase = role === 'assistant' && !hasTool && (stop === 'stop' || stop === 'aborted' || stop === 'end')
    ? 'done'
    : role === 'user' || role === 'toolResult' || role === 'assistant'
      ? 'working'
      : null;
  if (!phase) return false;
  if (cursor.phase === phase && cursor.observedAt === observedAt) return false;
  cursor.phase = phase;
  cursor.observedAt = observedAt;
  return true;
}

async function findPiSessionFile(cwd: string, sessionId: string): Promise<string | undefined> {
  const root = path.join(process.env.HOME || '', '.pi', 'agent', 'sessions', `-${cwd.replaceAll('/', '-')}--`);
  try {
    const names = await fs.readdir(root);
    const name = names.find((entry) => entry.includes(sessionId) && entry.endsWith('.jsonl'));
    return name ? path.join(root, name) : undefined;
  } catch {
    return undefined;
  }
}

async function readPiSessionHeader(file: string): Promise<{ id: string; cwd: string; startedAt: number } | undefined> {
  const handle = await fs.open(file, 'r');
  try {
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    const line = buffer.subarray(0, bytesRead).toString('utf8').split('\n', 1)[0];
    if (!line) return undefined;
    const header = JSON.parse(line) as { type?: string; id?: string; cwd?: string; timestamp?: string };
    const startedAt = header.timestamp ? Date.parse(header.timestamp) : Number.NaN;
    if (header.type !== 'session' || !header.id || !header.cwd || !Number.isFinite(startedAt)) return undefined;
    return { id: header.id, cwd: header.cwd, startedAt };
  } catch {
    return undefined;
  } finally {
    await handle.close();
  }
}
