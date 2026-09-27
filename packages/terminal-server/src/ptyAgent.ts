import { execFile, spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { parseAgentCommand } from '@bohemian/agent-protocol';

const execFileAsync = promisify(execFile);
const CACHE_MS = 1500;
export function tmuxAvailable(command = process.env.TMUX_COMMAND || 'tmux', socket?: string): boolean {
  try {
    return spawnSync(command, tmuxArgs(socket, ['-V']), { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

function tmuxArgs(socket: string | undefined, args: string[]): string[] {
  return socket ? ['-S', socket, ...args] : args;
}

export function tmuxName(terminalId: string): string {
  return `bohemian-${terminalId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
}

export function killTmuxSession(name: string, command = process.env.TMUX_COMMAND || 'tmux', socket?: string): void {
  try {
    spawnSync(command, tmuxArgs(socket, ['kill-session', '-t', name]), { stdio: 'ignore' });
  } catch {
    // The session may already be gone.
  }
}

export function hasTmuxSession(name: string, command = process.env.TMUX_COMMAND || 'tmux', socket?: string): boolean {
  try {
    return spawnSync(command, tmuxArgs(socket, ['has-session', '-t', name]), { stdio: 'ignore' }).status === 0;
  } catch {
    return false;
  }
}

function tmuxSet(command: string, socket: string | undefined, args: string[]): void {
  try {
    spawnSync(command, tmuxArgs(socket, args), { stdio: 'ignore' });
  } catch {
    /* tmux may not be running yet */
  }
}

/**
 * Private tmux server for board terminals only.
 * Status off avoids a geometry row. Alternate screen off keeps pane history on
 * the normal buffer so the outer terminal scrollbar can scroll it. smcup/rmcup
 * are removed so this server does not put xterm itself into the alternate buffer.
 */
export function hideTmuxStatus(command = process.env.TMUX_COMMAND || 'tmux', socket?: string, session?: string): void {
  const setOff = (target?: string) => {
    const args = target
      ? ['set-option', '-t', target, 'status', 'off']
      : ['set-option', '-g', 'status', 'off'];
    tmuxSet(command, socket, args);
  };
  tmuxSet(command, socket, ['set-option', '-g', 'history-limit', '100000']);
  tmuxSet(command, socket, ['set-option', '-g', 'alternate-screen', 'off']);
  tmuxSet(command, socket, ['set-option', '-g', 'terminal-overrides', ',xterm*:smcup@:rmcup@']);
  setOff();
  if (session) {
    setOff(session);
    tmuxSet(command, socket, ['set-option', '-t', session, 'alternate-screen', 'off']);
    return;
  }
  try {
    const listed = spawnSync(command, tmuxArgs(socket, ['list-sessions', '-F', '#{session_name}']), { encoding: 'utf8' });
    for (const name of String(listed.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)) {
      setOff(name);
      tmuxSet(command, socket, ['set-option', '-t', name, 'alternate-screen', 'off']);
    }
  } catch {
    /* no server yet */
  }
}


type Proc = { pid: number; ppid: number; command: string };

let cache: { at: number; byShell: Map<number, string> } | null = null;

export function invalidatePtyAgentCache() {
  cache = null;
}

/** Session id of an agent CLI that is a descendant of this shell PTY. */
export async function agentSessionIdForShell(shellPid: number | undefined): Promise<string | undefined> {
  if (!shellPid) return undefined;
  const table = await loadBindings();
  return table.get(shellPid);
}

async function loadBindings(): Promise<Map<number, string>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.byShell;
  const byShell = await scanBindings();
  cache = { at: Date.now(), byShell };
  return byShell;
}

async function scanBindings(): Promise<Map<number, string>> {
  const byShell = new Map<number, string>();
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,args='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const byPid = new Map<number, Proc>();
    const agents: Proc[] = [];
    for (const line of stdout.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      if (!Number.isInteger(pid) || pid <= 0) continue;
      const proc = { pid, ppid, command: match[3] ?? '' };
      byPid.set(pid, proc);
      if (parseAgentCommand(proc.command)?.sessionId) agents.push(proc);
    }

    for (const agent of agents) {
      const sessionId = parseAgentCommand(agent.command)?.sessionId;
      if (!sessionId) continue;
      const shellPid = nearestNonAgentAncestor(agent.ppid, byPid);
      if (shellPid && !byShell.has(shellPid)) byShell.set(shellPid, sessionId);
    }
  } catch {
    return byShell;
  }
  return byShell;
}

export const PI_LAUNCH_MATCH_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface PiSessionHeader {
  id: string;
  startedAt: number;
}

/** The session created by this PTY, not a later sibling and not the newest file mtime. */
export function selectPiLaunchSession(
  sessions: readonly PiSessionHeader[],
  createdAt: number,
  claimed?: ReadonlySet<string>,
): string | undefined {
  return sessions
    .filter((session) =>
      !claimed?.has(session.id) &&
      session.startedAt >= createdAt - 5_000 &&
      session.startedAt <= createdAt + PI_LAUNCH_MATCH_WINDOW_MS,
    )
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id))[0]?.id;
}

export async function listPiSessionHeaders(cwd: string): Promise<PiSessionHeader[]> {
  if (!cwd) return [];
  const root = path.join(process.env.HOME || '', '.pi', 'agent', 'sessions', `-${cwd.replaceAll('/', '-')}--`);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    const headers: PiSessionHeader[] = [];
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

function nearestNonAgentAncestor(start: number, byPid: Map<number, Proc>): number | undefined {
  let pid = start;
  const seen = new Set<number>();
  while (pid && !seen.has(pid)) {
    seen.add(pid);
    const proc = byPid.get(pid);
    if (!proc) return pid;
    if (!parseAgentCommand(proc.command)) return pid;
    pid = proc.ppid;
  }
  return undefined;
}

/** Kill a PTY shell and every descendant (pi/codex/claude) so live-status does not stick. */
export async function killPtyTree(rootPid: number | undefined): Promise<void> {
  if (!rootPid || rootPid <= 0) return;
  invalidatePtyAgentCache();
  const descendants = await listDescendants(rootPid);
  for (const pid of descendants) signalPid(pid, 'SIGTERM');
  signalPid(rootPid, 'SIGTERM');
  await new Promise((resolve) => setTimeout(resolve, 400));
  for (const pid of descendants) signalPid(pid, 'SIGKILL');
  signalPid(rootPid, 'SIGKILL');
  invalidatePtyAgentCache();
}

async function listDescendants(rootPid: number): Promise<number[]> {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const children = new Map<number, number[]>();
    for (const line of stdout.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      if (!Number.isInteger(pid) || pid <= 0) continue;
      const list = children.get(ppid) ?? [];
      list.push(pid);
      children.set(ppid, list);
    }
    const found: number[] = [];
    const stack = [...(children.get(rootPid) ?? [])];
    const seen = new Set<number>();
    while (stack.length) {
      const pid = stack.pop();
      if (!pid || seen.has(pid)) continue;
      seen.add(pid);
      found.push(pid);
      stack.push(...(children.get(pid) ?? []));
    }
    return found;
  } catch {
    return [];
  }
}

function signalPid(pid: number, signal: NodeJS.Signals) {
  try {
    process.kill(pid, signal);
  } catch {
    /* already gone */
  }
}
