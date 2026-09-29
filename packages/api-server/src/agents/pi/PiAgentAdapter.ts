import {
  UNKNOWN_MODEL,
  type AgentAdapter,
  type AgentDigestEntry,
  type AgentHealth,
  type AgentSession,
  type AgentWorkspace,
} from '@bohemian/agent-protocol';
import { SessionManager, type SessionInfo } from '@earendil-works/pi-coding-agent';
import {
  SESSION_MODEL_CONCURRENCY,
  SessionModelCache,
  mapPool,
  readPiSessionModel,
  readPiSessionTokenCount,
  readPiSessionUsageBreakdown,
  SessionNumberCache,
  SessionUsageCache,
} from '../sessionModel';
import { createTtlCache } from '../ttlCache';

const LISTING_TTL_MS = 10_000;

/** Pi history adapter backed by the official SessionManager. */
export class PiAgentAdapter implements AgentAdapter {
  readonly kind = 'pi' as const;
  private readonly models = new SessionModelCache();
  private readonly tokenCounts = new SessionNumberCache();
  private readonly usageBreakdowns = new SessionUsageCache();
  private readonly listing = createTtlCache<SessionInfo[]>(LISTING_TTL_MS);

  constructor(private readonly sessionDir?: string) {}

  private listAll(): Promise<SessionInfo[]> {
    return this.listing.get(() =>
      this.sessionDir ? SessionManager.listAll(this.sessionDir) : SessionManager.listAll(),
    );
  }

  async health(): Promise<AgentHealth> {
    try {
      await this.listAll();
      return { kind: this.kind, online: true, endpoint: 'local:pi-session-manager' };
    } catch {
      return { kind: this.kind, online: false, endpoint: 'local:pi-session-manager' };
    }
  }

  async listSessions(): Promise<AgentSession[]> {
    const sessions = await this.listAll();
    return mapPool(sessions, SESSION_MODEL_CONCURRENCY, (session) => this.toSession(session));
  }

  async digest(): Promise<AgentDigestEntry[]> {
    const sessions = await this.listAll();
    return mapPool(sessions, SESSION_MODEL_CONCURRENCY, async (session) => ({
      id: session.id,
      agentKind: this.kind,
      modified: session.modified.toISOString(),
      messageCount: session.messageCount,
      ...(session.path
        ? { tokenCount: await this.tokenCounts.get(session.path, readPiSessionTokenCount) }
        : {}),
      workingDir: session.cwd,
      status: 'completed' as const,
    }));
  }

  async listWorkspaces(): Promise<AgentWorkspace[]> {
    const sessions = await this.listAll();
    const byPath = new Map<string, AgentWorkspace>();

    for (const session of sessions) {
      if (!session.cwd) continue;
      const previous = byPath.get(session.cwd);
      if (!previous) {
        byPath.set(session.cwd, {
          path: session.cwd,
          name: basename(session.cwd),
          lastActivity: session.modified.toISOString(),
          count: 1,
          agentKind: this.kind,
        });
      } else {
        previous.count += 1;
        const modified = session.modified.toISOString();
        if (modified > previous.lastActivity) previous.lastActivity = modified;
      }
    }

    return [...byPath.values()];
  }

  private async toSession(session: SessionInfo): Promise<AgentSession> {
    const name = session.name?.trim() || cleanTitle(session.firstMessage) || session.id;
    const model = session.path
      ? await this.models.get(session.path, readPiSessionModel)
      : UNKNOWN_MODEL;
    const tokenCount = session.path
      ? await this.tokenCounts.get(session.path, readPiSessionTokenCount)
      : undefined;
    const usageBreakdown = session.path
      ? await this.usageBreakdowns.get(session.path, readPiSessionUsageBreakdown)
      : undefined;
    return {
      id: session.id,
      agentKind: this.kind,
      name,
      fullText: session.firstMessage,
      project: basename(session.cwd) || 'unknown',
      workingDir: session.cwd,
      status: 'completed',
      model,
      progress: 100,
      startTime: session.created.toISOString(),
      lastActivity: session.modified.toISOString(),
      size: Math.max(30, session.messageCount * 3),
      messageCount: session.messageCount,
      ...(tokenCount !== undefined ? { tokenCount } : {}),
      ...(usageBreakdown ? { usageBreakdown } : {}),
      toolCalls: 0,
      tools: [],
      // Pi history is local now; the preview layer can use the session id
      // without requiring a pi-web instance.
      openUrl: `pi://session/${encodeURIComponent(session.id)}`,
    };
  }
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}

function cleanTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}
