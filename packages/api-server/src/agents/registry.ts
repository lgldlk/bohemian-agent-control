import type {
  AgentAdapter,
  AgentDigestEntry,
  AgentHealth,
  AgentSession,
  AgentWorkspace,
} from '@bohemian/agent-protocol';
import { sessionFingerprint } from '@bohemian/agent-protocol';
import { applyLiveStatus, listLiveAgents } from './liveProcesses';

export class AgentRegistry {
  constructor(private readonly adapters: AgentAdapter[]) {}

  kinds(): string[] {
    return this.adapters.map((a) => a.kind);
  }

  async health(): Promise<AgentHealth[]> {
    return Promise.all(this.adapters.map((a) => a.health()));
  }

  async listSessions(): Promise<AgentSession[]> {
    const [groups, live] = await Promise.all([
      Promise.all(this.adapters.map((a) => a.listSessions().catch(() => [] as AgentSession[]))),
      listLiveAgents(),
    ]);
    return applyLiveStatus(
      groups.flat().sort((a, b) => +new Date(b.lastActivity) - +new Date(a.lastActivity)),
      live,
    );
  }

  async digest(): Promise<{ fingerprint: string; sessions: AgentDigestEntry[] }> {
    const [groups, live] = await Promise.all([
      Promise.all(this.adapters.map((a) => a.digest().catch(() => [] as AgentDigestEntry[]))),
      listLiveAgents(),
    ]);
    const sessions = applyLiveStatus(
      groups.flat().map((session) => ({
        ...session,
        lastActivity: session.modified ?? undefined,
      })),
      live,
    );
    return {
      fingerprint: sessions.map(sessionFingerprint).join('|'),
      sessions,
    };
  }

  close(): void {
    for (const adapter of this.adapters) adapter.close?.();
  }

  async listWorkspaces(): Promise<AgentWorkspace[]> {
    const groups = await Promise.all(
      this.adapters.map((a) => a.listWorkspaces().catch(() => [] as AgentWorkspace[])),
    );
    return groups.flat().sort((a, b) => (a.lastActivity < b.lastActivity ? 1 : -1));
  }
}
