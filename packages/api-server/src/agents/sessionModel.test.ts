import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { UNKNOWN_MODEL } from '@bohemian/agent-protocol';
import {
  agentModel,
  indexClaudeSessionFiles,
  mapPool,
  modelFromClaudeRecords,
  modelFromCodexRecords,
  modelFromPiRecords,
  readJsonlBookends,
  readClaudeSessionTokenCount,
  readClaudeSessionUsageBreakdown,
  readCodexSessionTokenCount,
  readCodexSessionUsageBreakdown,
  readPiSessionModel,
  readPiSessionTokenCount,
  readPiSessionUsageBreakdown,
} from './sessionModel';

describe('agentModel', () => {
  it('treats empty / synthetic ids as unknown', () => {
    expect(agentModel('')).toEqual(UNKNOWN_MODEL);
    expect(agentModel('<synthetic>', 'anthropic')).toEqual({ id: 'unknown', provider: 'anthropic' });
  });

  it('keeps real ids', () => {
    expect(agentModel('grok-4.6', 'grok')).toEqual({ id: 'grok-4.6', provider: 'grok' });
  });
});

describe('modelFromPiRecords', () => {
  it('prefers the latest model_change or assistant message', () => {
    expect(
      modelFromPiRecords([
        { type: 'session', id: 's' },
        { type: 'model_change', provider: 'anthropic', modelId: 'claude-opus-4-5' },
        { type: 'message', message: { role: 'assistant', model: 'grok-4.6', provider: 'grok' } },
      ]),
    ).toEqual({ id: 'grok-4.6', provider: 'grok' });

    expect(
      modelFromPiRecords([
        { type: 'message', message: { role: 'assistant', model: 'grok-4.6', provider: 'grok' } },
        { type: 'model_change', provider: 'anthropic', modelId: 'claude-sonnet-4-5' },
      ]),
    ).toEqual({ id: 'claude-sonnet-4-5', provider: 'anthropic' });
  });
});

describe('modelFromClaudeRecords', () => {
  it('skips synthetic assistant rows and takes the last real model', () => {
    expect(
      modelFromClaudeRecords([
        { type: 'assistant', message: { model: 'claude-sonnet-5' } },
        { type: 'assistant', message: { model: '<synthetic>' } },
      ]),
    ).toEqual({ id: 'claude-sonnet-5', provider: 'anthropic' });
  });

  it('falls back to system init', () => {
    expect(
      modelFromClaudeRecords([{ type: 'system', subtype: 'init', model: 'claude-opus-4-6' }]),
    ).toEqual({ id: 'claude-opus-4-6', provider: 'anthropic' });
  });
});

describe('modelFromCodexRecords', () => {
  it('uses the last turn_context model and session_meta provider', () => {
    expect(
      modelFromCodexRecords(
        [
          { type: 'session_meta', payload: { model_provider: 'custom' } },
          { type: 'turn_context', payload: { model: 'gpt-5.5' } },
          { type: 'turn_context', payload: { model: 'gpt-5.6-sol' } },
        ],
        'openai',
      ),
    ).toEqual({ id: 'gpt-5.6-sol', provider: 'custom' });
  });
});

describe('jsonl bookends + index', () => {
  it('parses bookends and indexes claude transcripts by session id', async () => {
    const dir = join(tmpdir(), `session-model-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const small = join(dir, 'small.jsonl');
    await writeFile(
      small,
      [
        JSON.stringify({ type: 'model_change', provider: 'grok', modelId: 'grok-4.6' }),
        JSON.stringify({ type: 'message', message: { model: 'grok-4.6', provider: 'grok' } }),
      ].join('\n'),
    );
    expect(await readPiSessionModel(small)).toEqual({ id: 'grok-4.6', provider: 'grok' });

    const lines = Array.from({ length: 400 }, (_, i) =>
      JSON.stringify({ type: 'message', n: i, message: { model: `m-${i}`, provider: 'p' } }),
    );
    const large = join(dir, 'large.jsonl');
    await writeFile(large, `${lines.join('\n')}\n`);
    const records = await readJsonlBookends(large, 800, 800);
    expect(records.length).toBeGreaterThan(0);
    expect(modelFromPiRecords(records).id).toMatch(/^m-\d+$/);

    const project = join(dir, 'projects', '-Users-demo');
    await mkdir(project, { recursive: true });
    const sessionId = '11111111-2222-4333-8444-555555555555';
    await writeFile(join(project, `${sessionId}.jsonl`), '{}\n');
    const index = await indexClaudeSessionFiles(join(dir, 'projects'));
    expect(index.get(sessionId)).toBe(join(project, `${sessionId}.jsonl`));
  });
});

describe('token counts', () => {
  it('normalizes Pi usage fields and sums input/output/cache tokens', async () => {
    const dir = join(tmpdir(), `session-token-pi-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'pi.jsonl');
    await writeFile(path, [
      JSON.stringify({ type: 'message', message: { role: 'assistant', usage: { input: 100, output: 20, cacheRead: 30, cacheWrite: 4 } } }),
      JSON.stringify({ type: 'usage', usage: { input: 6, output: 2, cacheRead: 0, cacheWrite: 1 } }),
    ].join('\n'));
    expect(await readPiSessionTokenCount(path)).toBe(163);
    expect(await readPiSessionUsageBreakdown(path)).toEqual({ input: 106, output: 22, cacheRead: 30, cacheWrite: 5 });
  });

  it('normalizes Claude transcript usage fields', async () => {
    const dir = join(tmpdir(), `session-token-claude-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'claude.jsonl');
    await writeFile(path, [
      JSON.stringify({ type: 'assistant', requestId: 'req-1', message: { id: 'msg-1', usage: {
        input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 30, cache_read_input_tokens: 4,
      } } }),
      JSON.stringify({ type: 'assistant', requestId: 'req-1', message: { id: 'msg-1', usage: {
        input_tokens: 100, output_tokens: 25, cache_creation_input_tokens: 30, cache_read_input_tokens: 4,
      } } }),
    ].join('\n'));
    expect(await readClaudeSessionTokenCount(path)).toBe(159);
    expect(await readClaudeSessionUsageBreakdown(path)).toEqual({ input: 100, output: 25, cacheRead: 4, cacheWrite: 30 });
  });

  it('uses Codex cumulative total tokens from the latest token event', async () => {
    const dir = join(tmpdir(), `session-token-codex-${process.pid}-${Date.now()}`);
    await mkdir(dir, { recursive: true });
    const path = join(dir, 'codex.jsonl');
    await writeFile(path, [
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 100, input_tokens: 70, output_tokens: 20, cached_input_tokens: 10 } } } }),
      JSON.stringify({ type: 'event_msg', payload: { type: 'token_count', info: { total_token_usage: { total_tokens: 245, input_tokens: 160, output_tokens: 55, cached_input_tokens: 30 }, last_token_usage: { input_tokens: 90, output_tokens: 35, cached_input_tokens: 20 } } } }),
    ].join('\n'));
    expect(await readCodexSessionTokenCount(path)).toBe(245);
    expect(await readCodexSessionUsageBreakdown(path)).toEqual({ input: 160, output: 55, cacheRead: 30, cacheWrite: 0 });
  });
});

describe('mapPool', () => {
  it('preserves order with a worker limit', async () => {
    const got = await mapPool([3, 2, 1], 2, async (n) => n * 10);
    expect(got).toEqual([30, 20, 10]);
  });
});
