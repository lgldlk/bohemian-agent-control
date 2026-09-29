import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { promisify } from 'node:util';
import {
  classifyAgentCommand,
  parseAgentCommand,
  sessionRefMatches,
  type AgentKind,
  type AgentStatus,
  type ParsedAgentCommand,
} from '@bohemian/agent-protocol';

const execFileAsync = promisify(execFile);
const CACHE_MS = 1500;

export interface LiveAgentProcess {
  pid: number;
  ppid: number;
  kind: AgentKind;
  cwd: string;
  sessionId?: string;
  command: string;
}

export type LiveCwdCounts = Map<string, number>;

let cache: { at: number; value: LiveAgentProcess[] } | null = null;
let inflight: Promise<LiveAgentProcess[]> | null = null;

export function liveCwdKey(kind: AgentKind, cwd: string): string {
  return `${kind}\0${normalizeCwd(cwd)}`;
}

export async function listLiveAgents(): Promise<LiveAgentProcess[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  if (inflight) return inflight;
  inflight = scanLiveAgents()
    .then((value) => {
      cache = { at: Date.now(), value };
      inflight = null;
      return value;
    })
    .catch((error) => {
      inflight = null;
      throw error;
    });
  return inflight;
}

export async function listLiveAgentCwds(): Promise<LiveCwdCounts> {
  const counts: LiveCwdCounts = new Map();
  for (const proc of await listLiveAgents()) {
    if (!proc.cwd) continue;
    const key = liveCwdKey(proc.kind, proc.cwd);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

export function applyLiveStatus<
  T extends { id: string; agentKind: AgentKind; workingDir?: string; lastActivity?: string; status?: AgentStatus; progress?: number },
>(sessions: T[], live: LiveAgentProcess[]): T[] {
  const runningIds = runningSessionIds(sessions, live);
  return sessions.map((session) => {
    if (runningIds.has(session.id)) {
      if (session.status === 'running') return session;
      return { ...session, status: 'running' as const, progress: -1 as const };
    }
    if (session.status === 'running' && session.agentKind === 'pi') {
      return { ...session, status: 'completed' as const, progress: 100 as const };
    }
    return session;
  });
}

export function runningSessionIds(
  sessions: Array<{ id: string; agentKind: AgentKind; workingDir?: string; lastActivity?: string }>,
  live: LiveAgentProcess[],
): Set<string> {
  const running = new Set<string>();
  for (const proc of live) {
    if (!proc.sessionId) continue;
    const hit = sessions.find(
      (session) => session.agentKind === proc.kind && sessionRefMatches(session.id, proc.sessionId!),
    );
    if (hit) running.add(hit.id);
  }
  return running;
}

async function scanLiveAgents(): Promise<LiveAgentProcess[]> {
  try {
    const { stdout } = await execFileAsync('ps', ['-axo', 'pid=,ppid=,args='], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const rows: Array<{ pid: number; ppid: number; command: string; parsed: ParsedAgentCommand }> = [];
    for (const line of stdout.split('\n')) {
      const match = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const ppid = Number(match[2]);
      const command = match[3] ?? '';
      if (!Number.isInteger(pid) || pid <= 0) continue;
      const parsed = parseAgentCommand(command);
      if (!parsed) continue;
      rows.push({ pid, ppid, command, parsed });
    }

    const cwds = await readProcessCwds(rows.map((row) => row.pid));
    return rows.map((row, index) => ({
      pid: row.pid,
      ppid: row.ppid,
      kind: row.parsed.kind,
      cwd: cwds[index] ?? '',
      sessionId: row.parsed.sessionId,
      command: row.command,
    }));
  } catch {
    return [];
  }
}

async function readProcessCwds(pids: number[]): Promise<string[]> {
  if (pids.length === 0) return [];
  if (process.platform === 'linux') {
    return pids.map((pid) => {
      try {
        return normalizeCwd(`/proc/${pid}/cwd`);
      } catch {
        return '';
      }
    });
  }
  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', pids.join(','), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      timeout: 3000,
    });
    const byPid = new Map<number, string>();
    let pid = 0;
    for (const line of stdout.split('\n')) {
      if (line.startsWith('p')) pid = Number(line.slice(1));
      if (line.startsWith('n') && pid) byPid.set(pid, normalizeCwd(line.slice(1)));
    }
    return pids.map((id) => byPid.get(id) ?? '');
  } catch {
    return pids.map(() => '');
  }
}

function normalizeCwd(cwd: string): string {
  const trimmed = cwd.trim().replace(/\/+$/, '') || cwd.trim();
  if (!trimmed) return '';
  try {
    return realpathSync(trimmed);
  } catch {
    return trimmed;
  }
}
