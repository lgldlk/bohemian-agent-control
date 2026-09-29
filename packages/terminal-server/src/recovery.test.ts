import { appendFile, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { PTYManager } from './PTYManager';
import { TerminalWebSocketServer } from './WebSocketServer';
import { tmuxAvailable } from './ptyAgent';

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
  it('does not push output to subscribers while paused, but the snapshot still has it', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'bac-pty-pause-'));
    const manager = new PTYManager({ stateDir: dir, persistentSessions: false });
    cleanups.push(() => manager.dispose());
    const seen: string[] = [];
    const id = manager.spawn({
      shell: '/bin/sh',
      args: ['-c', 'sleep 0.2; printf paused-byte'],
      size: { cols: 40, rows: 10 },
    });
    expect(manager.pause(id)).toBe(true);
    manager.subscribe(id, (data) => seen.push(data));
    await waitFor(() => manager.getSnapshot(id)?.data.includes('paused-byte') === true, 'paused output');
    expect(seen.join('')).not.toContain('paused-byte');
    expect(manager.resume(id)).toBe(true);
    expect(seen.join('')).toContain('paused-byte');
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
