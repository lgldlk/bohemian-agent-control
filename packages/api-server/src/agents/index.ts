import type { ApiConfig } from '../config';
import { AgentRegistry } from './registry';
import { ClaudeCodeAgentAdapter } from './claude-code/ClaudeCodeAgentAdapter';
import { CodexAgentAdapter } from './codex/CodexAgentAdapter';
import { PiAgentAdapter } from './pi/PiAgentAdapter';

export { AgentRegistry } from './registry';

/**
 * 接新 Agent：
 *   1. packages/api-server/src/agents/<kind>/XxxAgentAdapter.ts 实现 AgentAdapter
 *   2. 在 createDefaultRegistry 里 new 进去
 */
export function createDefaultRegistry(config: ApiConfig): AgentRegistry {
  return new AgentRegistry([
    new PiAgentAdapter(config.piSessionDir),
    new CodexAgentAdapter(config.codexCommand, config.codexHome),
    new ClaudeCodeAgentAdapter(),
  ]);
}
