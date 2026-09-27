import { open, readdir, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { UNKNOWN_MODEL, type AgentModel } from '@bohemian/agent-protocol';

const HEAD_BYTES = 32 * 1024;
const TAIL_BYTES = 256 * 1024;
const SYNTHETIC = new Set(['', 'unknown', '<synthetic>', 'synthetic']);

export const SESSION_MODEL_CONCURRENCY = 16;

export function agentModel(id?: string | null, provider?: string | null): AgentModel {
  const modelId = (id ?? '').trim();
  const prov = (provider ?? '').trim();
  if (!modelId || SYNTHETIC.has(modelId.toLowerCase())) {
    return prov ? { id: 'unknown', provider: prov } : UNKNOWN_MODEL;
  }
  return { id: modelId, provider: prov };
}

export function isUnknownModel(model: AgentModel): boolean {
  return !model.id || SYNTHETIC.has(model.id.toLowerCase());
}

export class SessionModelCache {
  private readonly cache = new Map<string, { mtimeMs: number; size: number; model: AgentModel }>();

  async get(path: string, extract: (filePath: string) => AgentModel | Promise<AgentModel>): Promise<AgentModel> {
    try {
      const info = await stat(path);
      const hit = this.cache.get(path);
      if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.model;
      const model = await extract(path);
      this.cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, model });
      return model;
    } catch {
      return UNKNOWN_MODEL;
    }
  }
}

export async function mapPool<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const out: R[] = new Array(items.length);
  let next = 0;
  const n = Math.min(Math.max(1, limit), items.length);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (true) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i] as T, i);
      }
    }),
  );
  return out;
}

export async function readJsonlBookends(
  path: string,
  headBytes = HEAD_BYTES,
  tailBytes = TAIL_BYTES,
): Promise<unknown[]> {
  const fh = await open(path, 'r');
  try {
    const size = (await fh.stat()).size;
    if (size <= 0) return [];
    if (size <= headBytes + tailBytes) {
      const buf = Buffer.alloc(size);
      await fh.read(buf, 0, size, 0);
      return parseJsonlChunk(buf.toString('utf8'), false, false);
    }
    const head = Buffer.alloc(headBytes);
    const tail = Buffer.alloc(tailBytes);
    await fh.read(head, 0, headBytes, 0);
    await fh.read(tail, 0, tailBytes, size - tailBytes);
    return [
      ...parseJsonlChunk(head.toString('utf8'), false, true),
      ...parseJsonlChunk(tail.toString('utf8'), true, false),
    ];
  } finally {
    await fh.close();
  }
}

export function modelFromPiRecords(records: unknown[]): AgentModel {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const rec = asRecord(records[i]);
    if (!rec) continue;
    if (rec.type === 'model_change') {
      return agentModel(str(rec.modelId), str(rec.provider));
    }
    if (rec.type === 'message') {
      const message = asRecord(rec.message);
      const id = str(message?.model) || str(message?.modelId);
      if (id) return agentModel(id, str(message?.provider));
    }
  }
  return UNKNOWN_MODEL;
}

export function modelFromClaudeRecords(records: unknown[]): AgentModel {
  for (let i = records.length - 1; i >= 0; i -= 1) {
    const rec = asRecord(records[i]);
    if (!rec) continue;
    if (rec.type === 'assistant') {
      const id = str(asRecord(rec.message)?.model);
      if (id && !SYNTHETIC.has(id.toLowerCase())) return agentModel(id, 'anthropic');
    }
    if (rec.type === 'system' && rec.subtype === 'init') {
      const id = str(rec.model);
      if (id) return agentModel(id, 'anthropic');
    }
  }
  return UNKNOWN_MODEL;
}

export function modelFromCodexRecords(records: unknown[], fallbackProvider = ''): AgentModel {
  let model = '';
  let provider = fallbackProvider;
  for (const item of records) {
    const rec = asRecord(item);
    const payload = asRecord(rec?.payload);
    if (!rec || !payload) continue;
    if (rec.type === 'session_meta') {
      provider = str(payload.model_provider) || provider;
    }
    if (rec.type === 'turn_context') {
      model = str(payload.model) || model;
    }
  }
  return agentModel(model, provider);
}

export async function readPiSessionModel(path: string): Promise<AgentModel> {
  return modelFromPiRecords(await readJsonlBookends(path));
}

export async function readClaudeSessionModel(path: string): Promise<AgentModel> {
  return modelFromClaudeRecords(await readJsonlBookends(path));
}

export async function readCodexSessionModel(path: string, fallbackProvider = ''): Promise<AgentModel> {
  return modelFromCodexRecords(await readJsonlBookends(path), fallbackProvider);
}

export function claudeProjectsRoot(): string {
  const custom = process.env.CLAUDE_CONFIG_DIR?.trim();
  return custom ? join(custom, 'projects') : join(homedir(), '.claude', 'projects');
}

/** Map `sessionId` → transcript path under `~/.claude/projects/<project>/<id>.jsonl`. */
export async function indexClaudeSessionFiles(root = claudeProjectsRoot()): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  let dirs: Array<{ name: string; isDirectory(): boolean }>;
  try {
    dirs = await readdir(root, { withFileTypes: true });
  } catch {
    return map;
  }
  for (const dir of dirs) {
    if (!dir.isDirectory()) continue;
    const folder = join(root, dir.name);
    let files: string[] = [];
    try {
      files = await readdir(folder);
    } catch {
      continue;
    }
    for (const file of files) {
      if (!file.endsWith('.jsonl')) continue;
      map.set(file.slice(0, -'.jsonl'.length), join(folder, file));
    }
  }
  return map;
}

function parseJsonlChunk(text: string, dropFirst: boolean, dropLast: boolean): unknown[] {
  let lines = text.split('\n');
  if (dropFirst && lines.length > 0) lines = lines.slice(1);
  if (dropLast && lines.length > 0) lines = lines.slice(0, -1);
  const out: unknown[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      out.push(JSON.parse(trimmed));
    } catch {
      /* skip torn or non-JSON lines */
    }
  }
  return out;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}
