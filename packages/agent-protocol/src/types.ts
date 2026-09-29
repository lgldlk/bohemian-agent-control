export type AgentKind = 'codex' | 'claude-code' | 'pi';

/** Lifecycle from history + live process overlay. TUI activity is a separate layer. */
export type AgentStatus = 'running' | 'completed' | 'paused' | 'pending';

export interface AgentModel {
  id: string;
  provider: string;
}

export interface AgentUsageBreakdown {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export interface AgentSession {
  id: string;
  agentKind: AgentKind;
  name: string;
  fullText: string;
  project: string;
  workingDir: string;
  status: AgentStatus;
  model: AgentModel;
  progress: number;
  startTime: string;
  lastActivity: string;
  size: number;
  messageCount: number;
  /** Total reported input/output/cache tokens, when the provider persists usage. */
  tokenCount?: number;
  usageBreakdown?: AgentUsageBreakdown;
  toolCalls: number;
  tools: string[];
  openUrl: string;
}

export interface AgentDigestEntry {
  id: string;
  agentKind: AgentKind;
  modified: string | null;
  messageCount: number;
  /** Total reported input/output/cache tokens, when the provider persists usage. */
  tokenCount?: number;
  workingDir?: string;
  status?: AgentStatus;
}

export interface AgentWorkspace {
  path: string;
  name: string;
  lastActivity: string;
  count: number;
  agentKind: AgentKind;
}

export interface AgentHealth {
  kind: AgentKind;
  online: boolean;
  endpoint?: string;
}

export interface AgentAdapter {
  readonly kind: AgentKind;
  health(): Promise<AgentHealth>;
  listSessions(): Promise<AgentSession[]>;
  digest(): Promise<AgentDigestEntry[]>;
  listWorkspaces(): Promise<AgentWorkspace[]>;
  /** Release long-lived local transports (for example Codex app-server). */
  close?(): void;
}

/** 控制台 HTTP 对外的任务 DTO（日期为 ISO 字符串） */
export interface ControlTask {
  id: string;
  agentKind: AgentKind;
  name: string;
  fullText: string;
  project: string;
  workingDir: string;
  status: AgentStatus;
  model: string;
  provider: string;
  progress: number;
  startTime: string;
  lastActivity: string;
  size: number;
  messageCount: number;
  /** Total reported input/output/cache tokens, when the provider persists usage. */
  tokenCount?: number;
  usageBreakdown?: AgentUsageBreakdown;
  toolCalls: number;
  tools: string[];
  openUrl: string;
}

export const UNKNOWN_MODEL: AgentModel = { id: 'unknown', provider: '' };

export function sessionFingerprint(
  s: Pick<AgentDigestEntry, 'agentKind' | 'id' | 'modified' | 'messageCount' | 'tokenCount' | 'status'>,
): string {
  return `${s.agentKind}:${s.id}:${s.modified ?? ''}:${s.messageCount}:${s.tokenCount ?? ''}:${s.status ?? ''}`;
}

export function toControlTask(s: AgentSession): ControlTask {
  return {
    id: s.id,
    agentKind: s.agentKind,
    name: s.name,
    fullText: s.fullText,
    project: s.project,
    workingDir: s.workingDir,
    status: s.status,
    model: s.model.id,
    provider: s.model.provider,
    progress: s.progress,
    startTime: s.startTime,
    lastActivity: s.lastActivity,
    size: s.size,
    messageCount: s.messageCount,
    ...(s.tokenCount !== undefined ? { tokenCount: s.tokenCount } : {}),
    ...(s.usageBreakdown ? { usageBreakdown: s.usageBreakdown } : {}),
    toolCalls: s.toolCalls,
    tools: s.tools,
    openUrl: s.openUrl,
  };
}

/** Parse the JSON boundary used by the frontend sessions endpoint. */
export function parseControlTask(raw: unknown): ControlTask {
  if (!isRecord(raw)) throw new Error('Invalid task payload: expected an object');
  const agentKind = readAgentKind(raw.agentKind);
  const status = readAgentStatus(raw.status);
  return {
    id: readString(raw.id, 'id'),
    agentKind,
    name: readString(raw.name, 'name'),
    fullText: readString(raw.fullText, 'fullText'),
    project: readString(raw.project, 'project'),
    workingDir: readString(raw.workingDir, 'workingDir'),
    status,
    model: readString(raw.model, 'model'),
    provider: readString(raw.provider, 'provider'),
    progress: readFiniteNumber(raw.progress, 'progress'),
    startTime: readDateString(raw.startTime, 'startTime'),
    lastActivity: readDateString(raw.lastActivity, 'lastActivity'),
    size: readFiniteNumber(raw.size, 'size'),
    messageCount: readFiniteNumber(raw.messageCount, 'messageCount'),
    ...(raw.tokenCount === undefined ? {} : { tokenCount: readFiniteNumber(raw.tokenCount, 'tokenCount') }),
    ...(raw.usageBreakdown === undefined ? {} : { usageBreakdown: readUsageBreakdown(raw.usageBreakdown) }),
    toolCalls: readFiniteNumber(raw.toolCalls, 'toolCalls'),
    tools: readStringArray(raw.tools, 'tools'),
    openUrl: readString(raw.openUrl, 'openUrl'),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function readString(value: unknown, field: string): string {
  if (typeof value !== 'string') throw new Error(`Invalid task payload: ${field} must be a string`);
  return value;
}

function readDateString(value: unknown, field: string): string {
  const result = readString(value, field);
  if (Number.isNaN(Date.parse(result))) throw new Error(`Invalid task payload: ${field} must be a date`);
  return result;
}

function readFiniteNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid task payload: ${field} must be a finite number`);
  }
  return value;
}

function readStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw new Error(`Invalid task payload: ${field} must be an array of strings`);
  }
  return value;
}

function readAgentKind(value: unknown): AgentKind {
  if (value === 'codex' || value === 'claude-code' || value === 'pi') return value;
  throw new Error(`Invalid task payload: agentKind is unsupported`);
}

function readUsageBreakdown(value: unknown): AgentUsageBreakdown {
  if (!isRecord(value)) throw new Error('Invalid task payload: usageBreakdown must be an object');
  return {
    input: readNonNegativeNumber(value.input, 'usageBreakdown.input'),
    output: readNonNegativeNumber(value.output, 'usageBreakdown.output'),
    cacheRead: readNonNegativeNumber(value.cacheRead, 'usageBreakdown.cacheRead'),
    cacheWrite: readNonNegativeNumber(value.cacheWrite, 'usageBreakdown.cacheWrite'),
  };
}

function readNonNegativeNumber(value: unknown, field: string): number {
  const number = readFiniteNumber(value, field);
  if (number < 0) throw new Error(`Invalid task payload: ${field} must be >= 0`);
  return number;
}

function readAgentStatus(value: unknown): AgentStatus {
  if (value === 'running' || value === 'completed' || value === 'paused' || value === 'pending') return value;
  throw new Error(`Invalid task payload: status is unsupported`);
}
