import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PTYManager } from './PTYManager';
import { TerminalWebSocketServer } from './WebSocketServer';
import { killTmuxSession, tmuxAvailable, tmuxName } from './ptyAgent';

const TOKEN = 'recovery-token-recovery-token-ok';
const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function waitFor(predicate: () => boolean, label: string): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < 5000) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`timed out waiting for ${label}`);
}

describe('PTY session recovery', () => {
  it('allows only one PTY manager to own a state directory', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-lock-'));
    const first = new PTYManager({ stateDir: dir, persistentSessions: false });
    expect(() => new PTYManager({ stateDir: dir, persistentSessions: false }))
      .toThrow(/state directory is already in use/);
    await first.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it('launches a startup command as the PTY process without typed-command timing', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-startup-plan-'));
    const manager = new PTYManager({ stateDir: dir, persistentSessions: false });
    cleanups.push(() => manager.dispose());
    const id = manager.spawn({
      shell: '/bin/sh',
      startupCommand: 'printf startup-plan',
      launchToken: 'launch-test-token',
      startupCommandDelivery: 'shell-ready',
      size: { cols: 40, rows: 10 },
    });
    await waitFor(() => manager.getSnapshot(id)?.data.includes('startup-plan') === true, 'startup command');
    expect(manager.getInfo(id)).toMatchObject({
      startupCommand: 'printf startup-plan',
      startupCommandDelivery: 'shell-ready',
      startupStatus: 'delivered',
      launchToken: 'launch-test-token',
    });
    await manager.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });
  it('restarts a bound Codex terminal by resuming the same conversation', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-codex-resume-'));
    const manager = new PTYManager({
      stateDir: dir,
      persistentSessions: false,
      enableAgentHooks: false,
    });
    cleanups.push(() => manager.dispose());
    const id = manager.spawn({
      shell: '/bin/sh',
      startupCommand: 'sleep 30',
      startupCommandDelivery: 'shell-ready',
      launchToken: 'codex-restart-token',
      launchId: 'pending-codex',
      nodeId: 'pending-codex',
      agentKind: 'codex',
      size: { cols: 40, rows: 10 },
    });

    expect(manager.applyAgentStatus(id, 'codex-restart-token', {
      state: 'done',
      providerSessionId: 'codex-thread-123',
    })).toBe(true);

    expect(manager.restart(id)).toMatchObject({
      nodeId: 'codex-thread-123',
      startupCommand: "codex resume 'codex-thread-123'",
      startupCommandDelivery: 'shell-ready',
      startupStatus: 'delivered',
      status: 'running',
    });

    await manager.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps scrollback and command history after the server process is disposed', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-'));
    const manager = new PTYManager({ stateDir: dir, persistentSessions: false });
    cleanups.push(() => manager.dispose());
    const id = manager.spawn({
      shell: '/bin/sh',
      args: ['-c', 'printf "hello-recovery\\n"; sleep 30'],
      size: { cols: 80, rows: 24 },
    });
    await waitFor(() => manager.getSnapshot(id)?.data.includes('hello-recovery') === true, 'scrollback');
    manager.write(id, 'echo kept-command\r');
    expect(manager.history(id).some((entry) => entry.command === 'echo kept-command')).toBe(true);
    await manager.dispose();
    cleanups.length = 0;

    const restored = new PTYManager({ stateDir: dir, persistentSessions: false });
    cleanups.push(() => restored.dispose());
    expect(restored.getInfo(id)?.status).toBe('exited');
    expect(restored.getSnapshot(id)?.data).toContain('hello-recovery');
    expect(restored.history(id).map((entry) => entry.command)).toContain('echo kept-command');
    await restored.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });
  it('recovers a metadata archive with trailing bytes from an interrupted writer', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-corrupt-archive-'));
    const manager = new PTYManager({ stateDir: dir, persistentSessions: false });
    const id = manager.spawn({
      shell: '/bin/sh',
      args: ['-c', 'sleep 30'],
      size: { cols: 40, rows: 10 },
    });
    await manager.dispose();

    await appendFile(path.join(dir, `${id}.json`), '\nraw-terminal-output');
    const restored = new PTYManager({ stateDir: dir, persistentSessions: false });
    expect(restored.getInfo(id)?.id).toBe(id);
    await restored.dispose();
    await rm(dir, { recursive: true, force: true });
  });
  it('recovers an archive with a truncated unicode escape in scrollback', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-bad-escape-'));
    const manager = new PTYManager({ stateDir: dir, persistentSessions: false });
    const id = manager.spawn({
      shell: '/bin/sh',
      args: ['-c', 'printf "archive-escape\\n"; sleep 30'],
      size: { cols: 40, rows: 10 },
    });
    await waitFor(() => manager.getSnapshot(id)?.data.includes('archive-escape') === true, 'archive output');
    await manager.dispose();

    const archive = path.join(dir, `${id}.json`);
    const raw = await readFile(archive, 'utf8');
    expect(raw).toContain('archive-escape');
    await writeFile(archive, raw.replace('archive-escape', 'archive-esc\\u001'));
    const restored = new PTYManager({ stateDir: dir, persistentSessions: false });
    expect(restored.getInfo(id)?.id).toBe(id);
    await restored.dispose();
    await rm(dir, { recursive: true, force: true });
  });

  it('reattaches a live tmux-backed shell after manager restart', async () => {
    if (!tmuxAvailable()) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-reconnect-'));
    const first = new PTYManager({ stateDir: dir, persistentSessions: true });
    const id = first.spawn({
      shell: '/bin/sh',
      args: ['-c', 'printf "live-recovery\\n"; sleep 30'],
      size: { cols: 80, rows: 24 },
    });
    await waitFor(() => first.getSnapshot(id)?.data.includes('live-recovery') === true, 'live scrollback');
    await first.dispose();

    const second = new PTYManager({ stateDir: dir, persistentSessions: true });
    expect(second.getInfo(id)?.status).toBe('running');
    expect(second.getSnapshot(id)?.data).toContain('live-recovery');
    await second.close(id);
    await second.dispose();
    await rm(dir, { recursive: true, force: true });
  });
  it('resumes a bound agent when the tmux session is gone after restart', async () => {
    if (!tmuxAvailable()) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-agent-resume-'));
    const first = new PTYManager({
      stateDir: dir,
      persistentSessions: true,
      enableAgentHooks: false,
      enableProviderHooks: false,
    });
    const id = first.spawn({
      shell: '/bin/sh',
      startupCommand: 'sleep 30',
      startupCommandDelivery: 'shell-ready',
      agentKind: 'pi',
      nodeId: 'pi-session-1',
      launchId: 'pending-pi',
      launchToken: 'pi-recovery-token',
      size: { cols: 80, rows: 24 },
    });
    await waitFor(() => first.getInfo(id)?.status === 'running', 'first agent running');
    expect(first.applyAgentStatus(id, 'pi-recovery-token', { state: 'done', providerSessionId: 'pi-session-1' })).toBe(true);
    expect(first.getInfo(id)?.agentSessionId).toBe('pi-session-1');
    const beforeIncarnation = first.getInfo(id)?.incarnationId;
    await first.dispose();
    killTmuxSession(tmuxName(id), 'tmux', path.join(dir, '.tmux.sock'));

    const restored = new PTYManager({
      stateDir: dir,
      persistentSessions: true,
      enableAgentHooks: false,
      enableProviderHooks: false,
    });
    cleanups.push(() => restored.dispose());
    expect(restored.getInfo(id)).toMatchObject({
      status: 'running',
      agentSessionId: 'pi-session-1',
    });
    expect(restored.getInfo(id)?.startupCommand).toContain('pi --session');
    await waitFor(() => restored.getInfo(id)?.status === 'running', 'recovered agent status');
    expect(restored.getInfo(id)?.incarnationId).not.toBe(beforeIncarnation);
    await restored.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });

  it('writes a complete archive before dispose resolves so a restart can resume', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-dispose-archive-'));
    const manager = new PTYManager({
      stateDir: dir,
      persistentSessions: false,
      enableAgentHooks: false,
      enableProviderHooks: false,
    });
    const id = manager.spawn({
      shell: '/bin/sh',
      args: ['-c', 'printf dispose-archive; sleep 30'],
      agentKind: 'pi',
      nodeId: 'pi-dispose-session',
      launchId: 'pi-dispose-session',
      size: { cols: 40, rows: 10 },
    });
    await waitFor(() => manager.getSnapshot(id)?.data.includes('dispose-archive') === true, 'archive output');

    // Resolve a possibly-pending async write, then shut down.
    await manager.dispose();

    const metaPath = path.join(dir, `${id}.json`);
    expect(existsSync(metaPath)).toBe(true);
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as { info?: { id?: string } };
    expect(meta.info?.id).toBe(id);
    expect(existsSync(path.join(dir, `${id}.log`))).toBe(true);
    await rm(dir, { recursive: true, force: true });
  });

  it('does not relaunch historical archives that only claim to be running', async () => {
    if (!tmuxAvailable()) return;
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-stale-archives-'));
    await writeFile(path.join(dir, 'terminal-stale-a.json'), JSON.stringify({
      info: {
        id: 'terminal-stale-a',
        nodeId: 'pi-stale-session',
        launchId: 'pi-stale-session',
        agentKind: 'pi',
        status: 'running',
        title: 'stale',
        cwd: dir,
        shell: '/bin/sh',
        createdAt: 1,
        updatedAt: 1,
        size: { cols: 40, rows: 10 },
      },
      tmuxSession: 'bohemian-terminal-stale-a',
      sequence: 1,
      outputOffset: 1,
    }), 'utf8');

    const restored = new PTYManager({
      stateDir: dir,
      persistentSessions: true,
      enableAgentHooks: false,
      enableProviderHooks: false,
    });
    cleanups.push(() => restored.dispose());
    // The archive claims "running" and names a session, but its tmux server is
    // gone. It is history; restoring it must not spawn a fresh Agent process.
    expect(restored.getInfo('terminal-stale-a')?.status).toBe('exited');
    expect(restored.getInfo('terminal-stale-a')?.pid).toBeUndefined();
    await restored.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });

  it('keeps PTY execution running while an output attachment is detached', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-detached-output-'));
    const manager = new PTYManager({ stateDir: dir, persistentSessions: false });
    cleanups.push(() => manager.dispose());
    const seen: string[] = [];
    const id = manager.spawn({
      shell: '/bin/sh',
      args: ['-c', 'printf detached-byte; sleep 0.2; printf attached-byte; sleep 30'],
      size: { cols: 40, rows: 10 },
    });
    await waitFor(() => manager.getSnapshot(id)?.data.includes('detached-byte') === true, 'detached output snapshot');
    expect(manager.getInfo(id)?.status).toBe('running');
    const unsubscribe = manager.subscribe(id, (data) => seen.push(data));
    await waitFor(() => seen.join('').includes('attached-byte'), 'attached live output');
    expect(seen.join('')).toContain('attached-byte');
    expect(seen.join('')).not.toContain('detached-byte');
    unsubscribe();
    await manager.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });
});

describe('terminal websocket ownership', () => {
  it('moves input ownership to a newer connection for the same terminal', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-ws-owner-'));
    const manager = new PTYManager({
      stateDir: dir,
      persistentSessions: false,
      enableAgentHooks: false,
      enableProviderHooks: false,
    });
    const server = new TerminalWebSocketServer({
      port: 0,
      host: '127.0.0.1',
      ptyManager: manager,
      token: TOKEN,
      allowedOrigins: ['http://127.0.0.1:18720'],
    });
    cleanups.push(() => {
      server.close();
      return manager.dispose();
    });
    const port = await server.ready();
    const owner = await connect(`ws://127.0.0.1:${port}?token=${TOKEN}`, { origin: 'http://127.0.0.1:18720' });
    cleanups.push(() => owner.close());
    const id = manager.spawn({ shell: '/bin/sh', args: ['-c', 'sleep 30'], size: { cols: 40, rows: 10 } });

    owner.send(JSON.stringify({
      type: 'subscribe',
      id: 'owner-first',
      channel: 'terminal.output',
      owner: true,
      filter: { terminalId: id },
    }));
    await new Promise((resolve) => setTimeout(resolve, 100));

    const next = await connect(`ws://127.0.0.1:${port}?token=${TOKEN}`, { origin: 'http://127.0.0.1:18720' });
    cleanups.push(() => next.close());
    const responses: Array<{ id: string; success: boolean; result?: { accepted?: boolean } }> = [];
    next.on('message', (raw) => responses.push(JSON.parse(raw.toString()) as typeof responses[number]));
    next.send(JSON.stringify({
      type: 'subscribe',
      id: 'owner-second',
      channel: 'terminal.output',
      owner: true,
      filter: { terminalId: id },
    }));
    await new Promise((resolve) => setTimeout(resolve, 100));
    next.send(JSON.stringify({
      type: 'request',
      id: 'write-after-takeover',
      method: 'terminal.writeAccepted',
      params: { terminalId: id, data: '' },
    }));

    await waitFor(
      () => responses.some((item) => item.id === 'write-after-takeover'),
      'takeover write response',
    );
    const write = responses.find((item) => item.id === 'write-after-takeover');
    expect(write?.success).toBe(true);
    expect(write?.result?.accepted).toBe(true);

    server.close();
    await manager.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });
});

describe('terminal websocket auth', () => {
  it('refuses an upgrade without the token and accepts one with it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-ws-'));
    const manager = new PTYManager({ stateDir: dir });
    const server = new TerminalWebSocketServer({
      port: 0,
      host: '127.0.0.1',
      ptyManager: manager,
      token: TOKEN,
      allowedOrigins: ['http://127.0.0.1:18720'],
    });
    cleanups.push(() => {
      server.close();
      return manager.dispose();
    });
    const port = await server.ready();

    await expect(connect(`ws://127.0.0.1:${port}`)).rejects.toThrow();
    await expect(connect(`ws://127.0.0.1:${port}?token=${TOKEN}`, { origin: 'https://evil.example' })).rejects.toThrow();

    const ok = await connect(`ws://127.0.0.1:${port}?token=${TOKEN}`, { origin: 'http://127.0.0.1:18720' });
    ok.close();
    server.close();
    await manager.dispose();
    cleanups.length = 0;
    await rm(dir, { recursive: true, force: true });
  });
});

function connect(url: string, headers?: Record<string, string>): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    let settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      ws.terminate();
      reject(error);
    };
    ws.once('open', () => {
      if (settled) return;
      settled = true;
      resolve(ws);
    });
    ws.once('error', (error) => fail(error instanceof Error ? error : new Error('upgrade failed')));
    ws.once('unexpected-response', (_req, res) => fail(new Error(`upgrade rejected ${res.statusCode}`)));
  });
}
