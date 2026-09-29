import { createReadStream } from 'node:fs';
import { open, readdir, stat } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { UNKNOWN_MODEL, type AgentModel, type AgentUsageBreakdown } from '@bohemian/agent-protocol';

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

export class SessionNumberCache {
  private readonly cache = new Map<string, { mtimeMs: number; size: number; value: number | undefined }>();

  async get(path: string, extract: (filePath: string) => Promise<number | undefined>): Promise<number | undefined> {
    try {
      const info = await stat(path);
      const hit = this.cache.get(path);
      if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.value;
      const value = await extract(path);
      this.cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, value });
      return value;
    } catch {
      return undefined;
    }
  }
}

export class SessionUsageCache {
  private readonly cache = new Map<string, { mtimeMs: number; size: number; value: AgentUsageBreakdown | undefined }>();

  async get(path: string, extract: (filePath: string) => Promise<AgentUsageBreakdown | undefined>): Promise<AgentUsageBreakdown | undefined> {
    try {
      const info = await stat(path);
      const hit = this.cache.get(path);
      if (hit && hit.mtimeMs === info.mtimeMs && hit.size === info.size) return hit.value;
      const value = await extract(path);
      this.cache.set(path, { mtimeMs: info.mtimeMs, size: info.size, value });
      return value;
    } catch {
      return undefined;
    }
  }
}
export async function readJsonlTokenCount(
  path: string,
  extract: (record: unknown) => number | undefined,
  mode: 'sum' | 'latest' = 'sum',
): Promise<number | undefined> {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let total = 0;
  let found = false;
  try {
    for await (const line of lines) {
      if (!line) continue;
      let record: unknown;
      try {
        record = JSON.parse(line);
      } catch {
        continue;
      }
      const value = extract(record);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) continue;
      found = true;
      total = mode === 'latest' ? value : total + value;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return found ? total : undefined;
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' ? value as Record<string, unknown> : undefined;
}

function numeric(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 0;
}

function usageTokenTotal(usage: Record<string, unknown>, keys: string[]): number {
  return keys.reduce((sum, key) => sum + numeric(usage[key]), 0);
}

function usageBreakdown(usage: Record<string, unknown>, keys: { input: string; output: string; cacheRead: string; cacheWrite: string }): AgentUsageBreakdown {
  return {
    input: numeric(usage[keys.input]),
    output: numeric(usage[keys.output]),
    cacheRead: numeric(usage[keys.cacheRead]),
    cacheWrite: numeric(usage[keys.cacheWrite]),
  };
}

function hasUsage(breakdown: AgentUsageBreakdown): boolean {
  return breakdown.input > 0 || breakdown.output > 0 || breakdown.cacheRead > 0 || breakdown.cacheWrite > 0;
}


function piTokenCount(record: unknown): number | undefined {
  const entry = recordOf(record);
  const message = recordOf(entry?.message);
  const usage = recordOf(message?.usage) ?? recordOf(entry?.usage) ?? recordOf(entry?.details);
  if (!usage) return undefined;
  if (entry?.type === 'message' && message?.role !== 'assistant' && message?.role !== 'toolResult') return undefined;
  if (entry?.type !== 'message' && entry?.type !== 'usage' && entry?.type !== 'compaction' && entry?.type !== 'branch_summary') return undefined;
  return usageTokenTotal(usage, ['input', 'output', 'cacheRead', 'cacheWrite']);
}

function claudeTokenCount(record: unknown): number | undefined {
  const entry = recordOf(record);
  if (entry?.type !== 'assistant') return undefined;
  const usage = recordOf(recordOf(entry.message)?.usage);
  return usage
    ? usageTokenTotal(usage, ['input_tokens', 'output_tokens', 'cache_creation_input_tokens', 'cache_read_input_tokens'])
    : undefined;
}

function codexTokenCount(record: unknown): number | undefined {
  const entry = recordOf(record);
  const payload = recordOf(entry?.payload);
  const info = recordOf(payload?.info);
  const total = recordOf(info?.total_token_usage);
  return entry?.type === 'event_msg' && payload?.type === 'token_count' && total
    ? numeric(total.total_tokens)
    : undefined;
}

async function readSummedJsonlUsageBreakdown(
  path: string,
  extract: (record: unknown) => { value: AgentUsageBreakdown; key?: string } | undefined,
): Promise<AgentUsageBreakdown | undefined> {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const total: AgentUsageBreakdown = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const keyed = new Map<string, AgentUsageBreakdown>();
  let found = false;
  try {
    for await (const line of lines) {
      if (!line) continue;
      let record: unknown;
      try { record = JSON.parse(line); } catch { continue; }
      const extracted = extract(record);
      if (!extracted) continue;
      found = true;
      if (extracted.key) {
        const previous = keyed.get(extracted.key);
        keyed.set(extracted.key, previous ? {
          input: Math.max(previous.input, extracted.value.input),
          output: Math.max(previous.output, extracted.value.output),
          cacheRead: Math.max(previous.cacheRead, extracted.value.cacheRead),
          cacheWrite: Math.max(previous.cacheWrite, extracted.value.cacheWrite),
        } : extracted.value);
        continue;
      }
      total.input += extracted.value.input;
      total.output += extracted.value.output;
      total.cacheRead += extracted.value.cacheRead;
      total.cacheWrite += extracted.value.cacheWrite;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  for (const value of keyed.values()) {
    total.input += value.input;
    total.output += value.output;
    total.cacheRead += value.cacheRead;
    total.cacheWrite += value.cacheWrite;
  }
  return found ? total : undefined;
}

export async function readJsonlUsageBreakdown(
  path: string,
  extract: (record: unknown) => AgentUsageBreakdown | undefined,
): Promise<AgentUsageBreakdown | undefined> {
  return readSummedJsonlUsageBreakdown(path, (record) => {
    const value = extract(record);
    return value ? { value } : undefined;
  });
}

function piUsageBreakdown(record: unknown): AgentUsageBreakdown | undefined {
  const entry = recordOf(record);
  const message = recordOf(entry?.message);
  const usage = recordOf(message?.usage) ?? recordOf(entry?.usage) ?? recordOf(entry?.details);
  if (!usage) return undefined;
  if (entry?.type === 'message' && message?.role !== 'assistant' && message?.role !== 'toolResult') return undefined;
  if (entry?.type !== 'message' && entry?.type !== 'usage' && entry?.type !== 'compaction' && entry?.type !== 'branch_summary') return undefined;
  const result = usageBreakdown(usage, { input: 'input', output: 'output', cacheRead: 'cacheRead', cacheWrite: 'cacheWrite' });
  return hasUsage(result) ? result : undefined;
}

function claudeUsageBreakdown(record: unknown): AgentUsageBreakdown | undefined {
  const entry = recordOf(record);
  if (entry?.type !== 'assistant') return undefined;
  const usage = recordOf(recordOf(entry.message)?.usage);
  if (!usage) return undefined;
  const result = usageBreakdown(usage, {
    input: 'input_tokens', output: 'output_tokens',
    cacheRead: 'cache_read_input_tokens', cacheWrite: 'cache_creation_input_tokens',
  });
  return hasUsage(result) ? result : undefined;
}

function claudeUsageRecord(record: unknown): { value: AgentUsageBreakdown; key?: string } | undefined {
  const value = claudeUsageBreakdown(record);
  if (!value) return undefined;
  const entry = recordOf(record);
  const messageId = recordOf(entry?.message)?.id;
  const requestId = entry?.requestId;
  const key = typeof messageId === 'string' && messageId
    ? `${messageId}${typeof requestId === 'string' && requestId ? `:${requestId}` : ''}`
    : undefined;
  return { value, ...(key ? { key } : {}) };
}

function codexUsageBreakdown(record: unknown): AgentUsageBreakdown | undefined {
  const entry = recordOf(record);
  const payload = recordOf(entry?.payload);
  const info = recordOf(payload?.info);
  const total = recordOf(info?.total_token_usage);
  if (entry?.type !== 'event_msg' || payload?.type !== 'token_count' || !total) return undefined;
  const result = {
    input: numeric(total.input_tokens),
    output: numeric(total.output_tokens),
    cacheRead: numeric(total.cached_input_tokens),
    cacheWrite: 0,
  };
  return hasUsage(result) ? result : undefined;
}

async function readLatestJsonlUsageBreakdown(
  path: string,
  extract: (record: unknown) => AgentUsageBreakdown | undefined,
): Promise<AgentUsageBreakdown | undefined> {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let latest: AgentUsageBreakdown | undefined;
  try {
    for await (const line of lines) {
      if (!line) continue;
      let record: unknown;
      try { record = JSON.parse(line); } catch { continue; }
      latest = extract(record) ?? latest;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  return latest;
}

export function readPiSessionUsageBreakdown(path: string): Promise<AgentUsageBreakdown | undefined> {
  return readJsonlUsageBreakdown(path, piUsageBreakdown);
}

export function readClaudeSessionUsageBreakdown(path: string): Promise<AgentUsageBreakdown | undefined> {
  return readSummedJsonlUsageBreakdown(path, claudeUsageRecord);
}

export function readCodexSessionUsageBreakdown(path: string): Promise<AgentUsageBreakdown | undefined> {
  return readLatestJsonlUsageBreakdown(path, codexUsageBreakdown);
}


export function readPiSessionTokenCount(path: string): Promise<number | undefined> {
  return readJsonlTokenCount(path, piTokenCount);
}

async function readSummedJsonlTokenCount(
  path: string,
  extract: (record: unknown) => { value: number; key?: string } | undefined,
): Promise<number | undefined> {
  const input = createReadStream(path, { encoding: 'utf8' });
  const lines = createInterface({ input, crlfDelay: Infinity });
  const keyed = new Map<string, number>();
  let total = 0;
  let found = false;
  try {
    for await (const line of lines) {
      if (!line) continue;
      let record: unknown;
      try { record = JSON.parse(line); } catch { continue; }
      const extracted = extract(record);
      if (!extracted) continue;
      found = true;
      if (extracted.key) keyed.set(extracted.key, Math.max(keyed.get(extracted.key) ?? 0, extracted.value));
      else total += extracted.value;
    }
  } finally {
    lines.close();
    input.destroy();
  }
  for (const value of keyed.values()) total += value;
  return found ? total : undefined;
}

function claudeTokenRecord(record: unknown): { value: number; key?: string } | undefined {
  const value = claudeTokenCount(record);
  if (value === undefined) return undefined;
  const entry = recordOf(record);
  const messageId = recordOf(entry?.message)?.id;
  const requestId = entry?.requestId;
  const key = typeof messageId === 'string' && messageId
    ? `${messageId}${typeof requestId === 'string' && requestId ? `:${requestId}` : ''}`
    : undefined;
  return { value, ...(key ? { key } : {}) };
}

export function readClaudeSessionTokenCount(path: string): Promise<number | undefined> {
  return readSummedJsonlTokenCount(path, claudeTokenRecord);
}

export function readCodexSessionTokenCount(path: string): Promise<number | undefined> {
  return readJsonlTokenCount(path, codexTokenCount, 'latest');
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
