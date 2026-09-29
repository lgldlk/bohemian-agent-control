import * as fs from 'node:fs/promises';

export interface TurnCursor {
  path?: string;
  offset: number;
  partial: string;
  phase: 'idle' | 'working' | 'done';
  observedAt: number;
}

/** Read newly appended JSONL lines and let the caller interpret each one. */
export async function advanceJournal(
  cursor: TurnCursor,
  file: string | undefined,
  applyLine: (cursor: TurnCursor, line: string) => boolean,
): Promise<boolean> {
  if (!file) return false;
  cursor.path = file;
  const handle = await fs.open(file, 'r');
  let changed = false;
  try {
    const stat = await handle.stat();
    if (stat.size < cursor.offset) {
      cursor.offset = 0;
      cursor.partial = '';
    }
    while (cursor.offset < stat.size) {
      const length = Math.min(64 * 1024, stat.size - cursor.offset);
      const buffer = Buffer.alloc(length);
      const { bytesRead } = await handle.read(buffer, 0, length, cursor.offset);
      if (bytesRead <= 0) break;
      cursor.offset += bytesRead;
      const lines = (cursor.partial + buffer.subarray(0, bytesRead).toString('utf8')).split('\n');
      cursor.partial = lines.pop() ?? '';
      for (const line of lines) {
        if (applyLine(cursor, line)) changed = true;
      }
    }
  } catch {
    cursor.path = undefined;
    return false;
  } finally {
    await handle.close();
  }
  return changed;
}
