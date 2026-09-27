const PREFIX = '\x1b]9999;';
const MAX_PENDING = 64 * 1024;

function prefixCarry(data: string): string {
  for (let length = Math.min(data.length, PREFIX.length - 1); length > 0; length--) {
    const candidate = data.slice(-length);
    if (PREFIX.startsWith(candidate)) return candidate;
  }
  return '';
}

export type AgentStatusState = 'working' | 'waiting' | 'blocked' | 'done';

export interface ParsedAgentStatus {
  state: AgentStatusState;
  prompt?: string;
  agentType?: string;
  model?: string;
  toolName?: string;
  toolInput?: string;
  lastAssistantMessage?: string;
  providerSessionId?: string;
}

export interface TerminalAgentStatusDetail extends ParsedAgentStatus {
  origin: 'osc' | 'title' | 'hook';
  observedAt: number;
}

export interface ProcessedAgentStatusChunk {
  cleanData: string;
  payloads: ParsedAgentStatus[];
}

function validString(value: unknown, max = 16_000): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > max || /[\u0000-\u001f\u007f]/.test(trimmed)) return undefined;
  return trimmed;
}

function parsePayload(raw: string): ParsedAgentStatus | null {
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value !== 'object') return null;
    if (value.state !== 'working' && value.state !== 'waiting' && value.state !== 'blocked' && value.state !== 'done') {
      return null;
    }
    return {
      state: value.state,
      prompt: validString(value.prompt),
      agentType: validString(value.agentType, 80),
      model: validString(value.model, 160),
      toolName: validString(value.toolName, 120),
      toolInput: validString(value.toolInput, 2_000),
      lastAssistantMessage: validString(value.lastAssistantMessage, 8_000),
      providerSessionId: validString(value.providerSessionId, 512),
    };
  } catch {
    return null;
  }
}

/** Parse structured OSC 9999 status frames without leaking them into xterm output. */
export function createAgentStatusParser(): (data: string) => ProcessedAgentStatusChunk {
  let pending = '';

  return (data) => {
    if (pending.length === 0 && !data.includes(PREFIX)) {
      const carry = prefixCarry(data);
      if (!carry) return { cleanData: data, payloads: [] };
      pending = carry;
      return { cleanData: data.slice(0, data.length - carry.length), payloads: [] };
    }

    const combined = pending + data;
    pending = '';
    const payloads: ParsedAgentStatus[] = [];
    let cleanData = '';
    let cursor = 0;

    while (cursor < combined.length) {
      const start = combined.indexOf(PREFIX, cursor);
      if (start < 0) {
        const tail = combined.slice(cursor);
        const carry = prefixCarry(tail);
        cleanData += carry ? tail.slice(0, tail.length - carry.length) : tail;
        pending = carry;
        break;
      }

      cleanData += combined.slice(cursor, start);
      const payloadStart = start + PREFIX.length;
      const bel = combined.indexOf('\x07', payloadStart);
      const st = combined.indexOf('\x1b\\', payloadStart);
      let end = -1;
      let terminatorLength = 0;
      if (bel >= 0 && (st < 0 || bel < st)) {
        end = bel;
        terminatorLength = 1;
      } else if (st >= 0) {
        end = st;
        terminatorLength = 2;
      }

      if (end < 0) {
        const frame = combined.slice(start);
        pending = frame.length <= MAX_PENDING ? frame : '';
        break;
      }

      const payload = parsePayload(combined.slice(payloadStart, end));
      if (payload) payloads.push(payload);
      cursor = end + terminatorLength;
    }

    return { cleanData, payloads };
  };
}
