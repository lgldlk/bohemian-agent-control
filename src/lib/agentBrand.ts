export type AgentKindId = 'codex' | 'claude-code' | 'pi';

export type AgentBrand = {
  id: AgentKindId;
  iconId: 'openai' | 'anthropic' | 'pi';
  labelKey: 'add.agents.codex' | 'add.agents.claudeCode' | 'add.agents.pi';
};

const BRANDS: Record<AgentKindId, AgentBrand> = {
  codex: { id: 'codex', iconId: 'openai', labelKey: 'add.agents.codex' },
  'claude-code': { id: 'claude-code', iconId: 'anthropic', labelKey: 'add.agents.claudeCode' },
  pi: { id: 'pi', iconId: 'pi', labelKey: 'add.agents.pi' },
};

export function parseAgentKind(value?: string): AgentBrand | null {
  const normalized = (value ?? '').trim().toLowerCase().replace(/[ _]+/g, '-');
  if (!normalized) return null;
  if (normalized.includes('codex')) return BRANDS.codex;
  if (normalized.includes('claude')) return BRANDS['claude-code'];
  if (normalized === 'pi' || normalized.includes('pi-web') || normalized.startsWith('pi-')) {
    return BRANDS.pi;
  }
  return null;
}
