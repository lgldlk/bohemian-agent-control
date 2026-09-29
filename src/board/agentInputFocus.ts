import type { TerminalRuntimePhase } from '@bohemian/terminal-ui/terminal';
import { parseAgentKind, type AgentKindId } from '@/lib/agentBrand';

export interface AgentInputFocusTarget {
  focus(): void;
}

interface AgentInputFocusAdapter {
  focus(target: AgentInputFocusTarget): void;
  isReady(terminalStatus: string | undefined, runtimePhase: TerminalRuntimePhase): boolean;
}

/**
 * Each supported TUI owns its composer inside the terminal rather than as a DOM input.
 * Keep provider adapters separate so provider-specific activation and readiness can
 * evolve without leaking keystrokes or focus behavior into the other Agents.
 */
const AGENT_INPUT_FOCUS_ADAPTERS: Record<AgentKindId, AgentInputFocusAdapter> = {
  pi: { focus: focusPiInput, isReady: isPiInputReady },
  'claude-code': { focus: focusClaudeCodeInput, isReady: isClaudeCodeInputReady },
  codex: { focus: focusCodexInput, isReady: isCodexInputReady },
};

export function resolveAgentInputFocusKind(agentKind?: string): AgentKindId | null {
  return parseAgentKind(agentKind)?.id ?? null;
}

export function canAutoFocusAgentInput(agentKind?: string): boolean {
  return resolveAgentInputFocusKind(agentKind) !== null;
}

export function shouldAutoFocusAgentInput(
  agentKind: string | undefined,
  terminalStatus: string | undefined,
): boolean {
  return terminalStatus !== 'exited' && canAutoFocusAgentInput(agentKind);
}

export function isAgentInputReady(
  agentKind: string | undefined,
  terminalStatus: string | undefined,
  runtimePhase: TerminalRuntimePhase,
): boolean {
  const kind = resolveAgentInputFocusKind(agentKind);
  return kind ? AGENT_INPUT_FOCUS_ADAPTERS[kind].isReady(terminalStatus, runtimePhase) : false;
}

export function focusAgentInput(
  agentKind: string | undefined,
  target: AgentInputFocusTarget,
): boolean {
  const kind = resolveAgentInputFocusKind(agentKind);
  if (!kind) return false;
  AGENT_INPUT_FOCUS_ADAPTERS[kind].focus(target);
  return true;
}

function focusPiInput(target: AgentInputFocusTarget) {
  target.focus();
}

function focusClaudeCodeInput(target: AgentInputFocusTarget) {
  target.focus();
}

function focusCodexInput(target: AgentInputFocusTarget) {
  target.focus();
}

function isPiInputReady(terminalStatus: string | undefined, runtimePhase: TerminalRuntimePhase) {
  return terminalStatus === 'running' && runtimePhase === 'ready';
}

function isClaudeCodeInputReady(terminalStatus: string | undefined, runtimePhase: TerminalRuntimePhase) {
  return terminalStatus === 'running' && runtimePhase === 'ready';
}

function isCodexInputReady(terminalStatus: string | undefined, runtimePhase: TerminalRuntimePhase) {
  return terminalStatus === 'running' && runtimePhase === 'ready';
}
