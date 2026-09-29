import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { tmuxBoardChromeArgs } from './ptyAgent';
import { applyClaudeSessionLine, claudeScreenPhase } from './agents/claude/sessions';
import { applyPiSessionLine } from './agents/pi/sessions';
import { advanceCodexTurn, applyCodexTurnLine, codexScreenPhase, listCodexSessionHeaders } from './agents/codex/sessions';
import { selectLaunchSession } from './agents/sessionMatch';

describe('tmux board chrome', () => {
  it('keeps alternate screen enabled and clears a smcup/rmcup override', () => {
    const global = tmuxBoardChromeArgs();
    const session = tmuxBoardChromeArgs('bohemian-1');
    expect(global).toEqual([
      ['set-option', '-g', 'history-limit', '100000'],
      ['set-option', '-gu', 'terminal-overrides'],
      ['set-option', '-g', 'alternate-screen', 'on'],
      ['set-option', '-g', 'status', 'off'],
      ['set-option', '-g', 'extended-keys', 'on'],
      ['set-option', '-g', 'extended-keys-format', 'csi-u'],
      ['set-option', '-as', 'terminal-features', 'xterm*:extkeys'],
    ]);
    expect(session).toContainEqual(['set-option', '-t', 'bohemian-1', 'alternate-screen', 'on']);
    expect(session.some((args) => args.includes('off') && args.includes('alternate-screen'))).toBe(false);
    expect(session.some((args) => args.includes('smcup@'))).toBe(false);
  });
});

describe('selectLaunchSession', () => {
  const createdAt = Date.parse('2026-09-26T14:08:38.833Z');

  it('binds the session created with the PTY, ignoring older files and later siblings', () => {
    expect(selectLaunchSession([
      { id: 'old', startedAt: createdAt - 60_000 },
      { id: 'launch', startedAt: createdAt + 373 },
      { id: 'sibling', startedAt: createdAt + 60_000 },
    ], createdAt)).toBe('launch');
  });

  it('does not reuse a session already claimed by an earlier terminal', () => {
    const sessions = [
      { id: 'first', startedAt: createdAt + 1_000 },
      { id: 'second', startedAt: createdAt + 2_000 },
    ];
    const claimed = new Set<string>();
    const first = selectLaunchSession(sessions, createdAt, claimed);
    claimed.add(first!);
    expect(selectLaunchSession(sessions, createdAt + 1_500, claimed)).toBe('second');
  });
});

describe('listCodexSessionHeaders', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const directory of tempDirs.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
  });

  it('reads cwd and session id from a Codex rollout header', async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-codex-home-'));
    tempDirs.push(home);
    const day = new Date();
    const dir = path.join(
      home,
      'sessions',
      String(day.getFullYear()),
      String(day.getMonth() + 1).padStart(2, '0'),
      String(day.getDate()).padStart(2, '0'),
    );
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'rollout-test-01a0e63d-71fb-70d3-a72f-5936d8d993b6.jsonl'), JSON.stringify({
      timestamp: '2026-09-28T04:19:43.926Z',
      type: 'session_meta',
      payload: {
        session_id: '01a0e63d-71fb-70d3-a72f-5936d8d993b6',
        cwd: '/Users/lgldl/Desktop/work/reverse_work',
        timestamp: '2026-09-28T04:19:41.772Z',
        base_instructions: { text: 'x'.repeat(12_000) },
      },
    }) + '\n');
    const previous = process.env.CODEX_HOME;
    process.env.CODEX_HOME = home;
    try {
      await expect(listCodexSessionHeaders('/Users/lgldl/Desktop/work/reverse_work')).resolves.toEqual([
        { id: '01a0e63d-71fb-70d3-a72f-5936d8d993b6', startedAt: Date.parse('2026-09-28T04:19:41.772Z') },
      ]);
      await expect(listCodexSessionHeaders('/tmp/other')).resolves.toEqual([]);
      const cursor = { offset: 0, partial: '', phase: 'idle' as const, observedAt: 0 };
      await expect(advanceCodexTurn(cursor, '01a0e63d-71fb-70d3-a72f-5936d8d993b6')).resolves.toBe(false);
      const file = path.join(dir, 'rollout-test-01a0e63d-71fb-70d3-a72f-5936d8d993b6.jsonl');
      fs.appendFileSync(file, JSON.stringify({
        timestamp: '2026-09-28T04:19:50.000Z',
        type: 'event_msg',
        payload: { type: 'task_started', turn_id: 'turn-1' },
      }) + '\n');
      await expect(advanceCodexTurn(cursor, '01a0e63d-71fb-70d3-a72f-5936d8d993b6')).resolves.toBe(true);
      expect(cursor.phase).toBe('working');
      fs.appendFileSync(file, JSON.stringify({
        timestamp: '2026-09-28T04:20:08.000Z',
        type: 'event_msg',
        payload: { type: 'task_complete', turn_id: 'turn-1' },
      }) + '\n');
      await expect(advanceCodexTurn(cursor, '01a0e63d-71fb-70d3-a72f-5936d8d993b6')).resolves.toBe(true);
      expect(cursor.phase).toBe('done');
      await expect(advanceCodexTurn(cursor, '01a0e63d-71fb-70d3-a72f-5936d8d993b6')).resolves.toBe(false);
    } finally {
      if (previous === undefined) delete process.env.CODEX_HOME;
      else process.env.CODEX_HOME = previous;
    }
  });
});

describe('codex turn close', () => {
  it('closes an interrupted turn and lets the later screen marker win', () => {
    const cursor = { phase: 'working' as const, observedAt: 1 };
    expect(applyCodexTurnLine(cursor, JSON.stringify({
      timestamp: '2026-09-28T05:00:00.000Z',
      type: 'event_msg',
      payload: { type: 'turn_aborted', reason: 'interrupted' },
    }))).toBe(true);
    expect(cursor.phase).toBe('done');
    expect(codexScreenPhase('Working (4s - esc to interrupt)')).toBe('working');
    expect(codexScreenPhase('Working (4s - esc to interrupt)\nAsk Codex to do anything')).toBe('done');
    expect(claudeScreenPhase('Simmering… (3m 38s)')).toBe('working');
    expect(claudeScreenPhase('bypass permissions on (shift+tab to cycle)')).toBe('done');
    expect(claudeScreenPhase('Simmering… (3m 38s)\nbypass permissions on')).toBe('working');
    const claude = { phase: 'idle' as const, observedAt: 0 };
    expect(applyClaudeSessionLine(claude, JSON.stringify({ type: 'user', message: { content: '你好' }, timestamp: '2026-09-28T05:46:00.000Z' }))).toBe(true);
    expect(claude.phase).toBe('working');
    expect(applyClaudeSessionLine(claude, JSON.stringify({ type: 'system', subtype: 'turn_duration', timestamp: '2026-09-28T05:51:11.374Z' }))).toBe(true);
    expect(claude.phase).toBe('done');
    const pi = { phase: 'idle' as const, observedAt: 0 };
    expect(applyPiSessionLine(pi, JSON.stringify({ type: 'message', timestamp: '2026-09-28T06:30:00.000Z', message: { role: 'user', content: '继续' } }))).toBe(true);
    expect(pi.phase).toBe('working');
    expect(applyPiSessionLine(pi, JSON.stringify({ type: 'message', timestamp: '2026-09-28T06:31:00.000Z', message: { role: 'assistant', stopReason: 'stop', content: [{ type: 'text', text: '好' }] } }))).toBe(true);
    expect(pi.phase).toBe('done');
  });
});
