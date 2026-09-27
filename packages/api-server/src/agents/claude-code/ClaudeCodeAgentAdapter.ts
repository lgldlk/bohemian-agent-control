import { listSessions, type SDKSessionInfo } from '@anthropic-ai/claude-agent-sdk';
import {
  UNKNOWN_MODEL,
  type AgentAdapter,
  type AgentDigestEntry,
  type AgentHealth,
  type AgentSession,
  type AgentWorkspace,
} from '@bohemian/agent-protocol';
import {
  SESSION_MODEL_CONCURRENCY,
  SessionModelCache,
  indexClaudeSessionFiles,
  mapPool,
  readClaudeSessionModel,
} from '../sessionModel';
import { createTtlCache } from '../ttlCache';

const LISTING_TTL_MS = 10_000;

/** Claude Code history adapter backed by the official Agent SDK. */
export class ClaudeCodeAgentAdapter implements AgentAdapter {
  readonly kind = 'claude-code' as const;
  private readonly models = new SessionModelCache();
  private readonly listing = createTtlCache<SDKSessionInfo[]>(LISTING_TTL_MS);

  private listSdkSessions(): Promise<SDKSessionInfo[]> {
    return this.listing.get(() => listSessions({ limit: 1000, includeWorktrees: true }));
  }

  async health(): Promise<AgentHealth> {
    try {
      await listSessions({ limit: 1, includeWorktrees: true });
      return { kind: this.kind, online: true, endpoint: 'local:claude-agent-sdk' };
    } catch {
      return { kind: this.kind, online: false, endpoint: 'local:claude-agent-sdk' };
    }
  }

  async listSessions(): Promise<AgentSession[]> {
    const [sessions, files] = await Promise.all([
      this.listSdkSessions(),
      indexClaudeSessionFiles(),
    ]);
    return mapPool(sessions, SESSION_MODEL_CONCURRENCY, (session) => this.toSession(session, files));
  }

  async digest(): Promise<AgentDigestEntry[]> {
    const sessions = await this.listSdkSessions();
    return sessions.map((session) => ({
      id: session.sessionId,
      agentKind: this.kind,
      modified: new Date(session.lastModified).toISOString(),
      messageCount: 0,
      workingDir: session.cwd ?? '',
      status: 'completed' as const,
    }));
  }

  async listWorkspaces(): Promise<AgentWorkspace[]> {
    const sessions = await listSessions({ limit: 1000, includeWorktrees: true });
    const byPath = new Map<string, AgentWorkspace>();
    for (const session of sessions) {
      const cwd = session.cwd ?? '';
      if (!cwd) continue;
      const lastActivity = new Date(session.lastModified).toISOString();
      const previous = byPath.get(cwd);
      if (previous) {
        previous.count += 1;
        if (lastActivity > previous.lastActivity) previous.lastActivity = lastActivity;
      } else {
        byPath.set(cwd, {
          path: cwd,
          name: basename(cwd),
          lastActivity,
          count: 1,
          agentKind: this.kind,
        });
      }
    }
    return [...byPath.values()];
  }

  private async toSession(session: SDKSessionInfo, files: Map<string, string>): Promise<AgentSession> {
    const created = session.createdAt ?? session.lastModified;
    const firstPrompt = session.firstPrompt ?? session.summary ?? '';
    const title = session.customTitle || session.summary || cleanTitle(firstPrompt) || session.sessionId;
    const cwd = session.cwd ?? '';
    const transcript = files.get(session.sessionId);
    const model = transcript
      ? await this.models.get(transcript, readClaudeSessionModel)
      : UNKNOWN_MODEL;
    return {
      id: session.sessionId,
      agentKind: this.kind,
      name: title,
      fullText: firstPrompt,
      project: basename(cwd) || 'unknown',
      workingDir: cwd,
      status: 'completed',
      model,
      progress: 100,
      startTime: new Date(created).toISOString(),
      lastActivity: new Date(session.lastModified).toISOString(),
      size: Math.max(30, session.fileSize ?? firstPrompt.length),
      messageCount: 0,
      toolCalls: 0,
      tools: [],
      openUrl: `claude://session/${encodeURIComponent(session.sessionId)}`,
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
