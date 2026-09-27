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
  readPiSessionModel,
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

describe('mapPool', () => {
  it('preserves order with a worker limit', async () => {
    const got = await mapPool([3, 2, 1], 2, async (n) => n * 10);
    expect(got).toEqual([30, 20, 10]);
  });
});
