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
 * Status off avoids a geometry row. Alternate screen stays on: a TUI paints
 * xterm's alternate buffer, matching Orca. Forcing it off makes tmux emulate
 * that paint on the normal buffer, so a cursor-addressed row ending in CR LF
 * scrolls into history and leaves a blank gap or stale cells.
 * `terminal-overrides` is unset because an older server cleared smcup/rmcup.
 * Extended keys stay on so Pi/Claude/Codex Shift+Enter and Super+arrows
 * survive the tmux client instead of collapsing to Enter or vanishing.
 */
const TMUX_GLOBAL_CHROME: string[][] = [
  ['set-option', '-g', 'history-limit', '100000'],
  ['set-option', '-gu', 'terminal-overrides'],
  ['set-option', '-g', 'alternate-screen', 'on'],
  ['set-option', '-g', 'status', 'off'],
  ['set-option', '-g', 'extended-keys', 'on'],
  ['set-option', '-g', 'extended-keys-format', 'csi-u'],
  ['set-option', '-as', 'terminal-features', 'xterm*:extkeys'],
];

export function tmuxBoardChromeArgs(session?: string): string[][] {
  if (!session) return TMUX_GLOBAL_CHROME.map((args) => [...args]);
  return [
    ...TMUX_GLOBAL_CHROME.map((args) => [...args]),
    ['set-option', '-t', session, 'status', 'off'],
    ['set-option', '-t', session, 'alternate-screen', 'on'],
  ];
}

export function hideTmuxStatus(command = process.env.TMUX_COMMAND || 'tmux', socket?: string, session?: string): void {
  const apply = (target?: string) => {
    for (const args of tmuxBoardChromeArgs(target)) tmuxSet(command, socket, args);
  };
  if (session) {
    apply(session);
    return;
  }
  apply();
  try {
    const listed = spawnSync(command, tmuxArgs(socket, ['list-sessions', '-F', '#{session_name}']), { encoding: 'utf8' });
    for (const name of String(listed.stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean)) {
      for (const args of tmuxBoardChromeArgs(name).slice(TMUX_GLOBAL_CHROME.length)) tmuxSet(command, socket, args);
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
