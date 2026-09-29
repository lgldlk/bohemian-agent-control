import {
  UNKNOWN_MODEL,
  type AgentAdapter,
  type AgentDigestEntry,
  type AgentHealth,
  type AgentSession,
  type AgentWorkspace,
} from '@bohemian/agent-protocol';
import { CodexAppServerClient } from './CodexAppServerClient';
import {
  SESSION_MODEL_CONCURRENCY,
  SessionModelCache,
  agentModel,
  isUnknownModel,
  mapPool,
  readCodexSessionModel,
  readCodexSessionTokenCount,
  readCodexSessionUsageBreakdown,
  SessionNumberCache,
  SessionUsageCache,
} from '../sessionModel';
import { createTtlCache } from '../ttlCache';

const LISTING_TTL_MS = 10_000;

export class CodexAgentAdapter implements AgentAdapter {
  readonly kind = 'codex' as const;
  private readonly appServer: CodexAppServerClient;
  private readonly models = new SessionModelCache();
  private readonly tokenCounts = new SessionNumberCache();
  private readonly usageBreakdowns = new SessionUsageCache();
  private readonly listing = createTtlCache<Record<string, unknown>[]>(LISTING_TTL_MS);

  constructor(command = 'codex', codexHome?: string) {
    this.appServer = new CodexAppServerClient(command, codexHome);
  }

  private listThreads(): Promise<Record<string, unknown>[]> {
    return this.listing.get(() => this.appServer.listThreads());
  }

  async health(): Promise<AgentHealth> {
    try {
      await this.listThreads();
      return { kind: this.kind, online: true, endpoint: 'local:codex-app-server' };
    } catch {
      return { kind: this.kind, online: false, endpoint: 'local:codex-app-server' };
    }
  }

  async listSessions(): Promise<AgentSession[]> {
    const threads = await this.listThreads();
    return mapPool(threads, SESSION_MODEL_CONCURRENCY, (thread) => this.toSession(thread));
  }

  async digest(): Promise<AgentDigestEntry[]> {
    const threads = await this.listThreads();
    return mapPool(threads, SESSION_MODEL_CONCURRENCY, async (thread) => {
      const status = threadStatus(thread);
      const path = stringValue(thread.path);
      return {
        id: stringValue(thread.id),
        agentKind: this.kind,
        modified: dateFromSeconds(thread.updatedAt),
        messageCount: Array.isArray(thread.turns) ? thread.turns.length : 0,
        ...(path
          ? { tokenCount: await this.tokenCounts.get(path, readCodexSessionTokenCount) }
          : {}),
        workingDir: stringValue(thread.cwd),
        status: status === 'inProgress' || status === 'running' ? 'running' as const : 'completed' as const,
      };
    });
  }

  async listWorkspaces(): Promise<AgentWorkspace[]> {
    const threads = await this.appServer.listThreads();
    const byPath = new Map<string, AgentWorkspace>();
    for (const thread of threads) {
      const cwd = stringValue(thread.cwd);
      if (!cwd) continue;
      const lastActivity = dateFromSeconds(thread.updatedAt) || new Date(0).toISOString();
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

  close(): void {
    this.appServer.close();
  }

  private async toSession(thread: Record<string, unknown>): Promise<AgentSession> {
    const id = stringValue(thread.id);
    const preview = stringValue(thread.preview);
    const cwd = stringValue(thread.cwd);
    const created = dateFromSeconds(thread.createdAt) || new Date(0).toISOString();
    const modified = dateFromSeconds(thread.updatedAt) || created;
    const status = threadStatus(thread);
    const listed = agentModel(
      stringValue(thread.model) || stringValue(thread.modelId),
      stringValue(thread.modelProvider),
    );
    const rollout = stringValue(thread.path);
    const model = !isUnknownModel(listed)
      ? listed
      : rollout
        ? await this.models.get(rollout, (path) => readCodexSessionModel(path, listed.provider))
        : listed.id === 'unknown' && listed.provider
          ? listed
          : UNKNOWN_MODEL;
    const tokenCount = rollout
      ? await this.tokenCounts.get(rollout, readCodexSessionTokenCount)
      : undefined;
    const usageBreakdown = rollout
      ? await this.usageBreakdowns.get(rollout, readCodexSessionUsageBreakdown)
      : undefined;

    return {
      id,
      agentKind: this.kind,
      name: stringValue(thread.name) || cleanTitle(preview) || id,
      fullText: preview,
      project: basename(cwd) || 'unknown',
      workingDir: cwd,
      status: status === 'inProgress' || status === 'running' ? 'running' : 'completed',
      model,
      progress: status === 'inProgress' || status === 'running' ? -1 : 100,
      startTime: created,
      lastActivity: modified,
      size: Math.max(30, preview.length),
      messageCount: Array.isArray(thread.turns) ? thread.turns.length : 0,
      ...(tokenCount !== undefined ? { tokenCount } : {}),
      ...(usageBreakdown ? { usageBreakdown } : {}),
      toolCalls: 0,
      tools: [],
      openUrl: `codex://thread/${encodeURIComponent(id)}`,
    };
  }
}

function threadStatus(thread: Record<string, unknown>): string {
  return thread.status && typeof thread.status === 'object'
    ? stringValue((thread.status as Record<string, unknown>).type)
    : '';
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function dateFromSeconds(value: unknown): string | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return new Date(value * 1000).toISOString();
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}

function cleanTitle(text: string): string {
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine.length > 90 ? `${oneLine.slice(0, 90)}…` : oneLine;
}
