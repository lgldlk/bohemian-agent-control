import type { AgentKind } from './types';

export interface ParsedAgentCommand {
  kind: AgentKind;
  sessionId?: string;
}

/** Split a process argv string, respecting single/double quotes. */
export function tokenizeCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  for (const char of command) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (/\s/.test(char)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += char;
  }
  if (current) tokens.push(current);
  return tokens;
}

export function classifyAgentCommand(command: string): AgentKind | null {
  const tokens = tokenizeCommand(command);
  if (tokens.length === 0) return null;
  const bin = tokens[0]?.split(/[\\/]/).pop() ?? '';
  if (bin === 'pi') return 'pi';
  if (bin === 'claude') return 'claude-code';
  if (bin === 'codex') {
    if (tokens.includes('app-server')) return null;
    return 'codex';
  }
  return null;
}

export function parseAgentCommand(command: string): ParsedAgentCommand | null {
  const kind = classifyAgentCommand(command);
  if (!kind) return null;
  const tokens = tokenizeCommand(command);
  let raw: string | undefined;
  if (kind === 'pi') raw = flagValue(tokens, ['--session', '--session-id']);
  else if (kind === 'claude-code') raw = flagValue(tokens, ['--resume']);
  else raw = subcommandValue(tokens, 'resume');
  return { kind, sessionId: normalizeSessionRef(raw) };
}

export function sessionRefMatches(sessionId: string, parsed: string): boolean {
  const a = sessionId.toLowerCase();
  const b = parsed.toLowerCase();
  if (a === b) return true;
  if (b.length >= 8 && a.startsWith(b)) return true;
  if (a.length >= 8 && b.startsWith(a)) return true;
  return false;
}

function flagValue(tokens: string[], names: string[]): string | undefined {
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (!token) continue;
    for (const name of names) {
      if (token === name) return tokens[i + 1];
      if (token.startsWith(`${name}=`)) return token.slice(name.length + 1);
    }
  }
  return undefined;
}

function subcommandValue(tokens: string[], subcommand: string): string | undefined {
  const index = tokens.indexOf(subcommand);
  if (index >= 1 && index + 1 < tokens.length) return tokens[index + 1];
  return undefined;
}

function normalizeSessionRef(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const base = trimmed.split(/[\\/]/).pop() ?? trimmed;
  return base.replace(/\.jsonl$/i, '') || undefined;
}
