import { describe, expect, it } from 'vitest';
import type { AgentAdapter, AgentSession } from '@bohemian/agent-protocol';
import { AgentRegistry } from './registry';

function stub(kind: 'pi', sessions: Partial<AgentSession>[]): AgentAdapter {
  const full: AgentSession[] = sessions.map((s, i) => ({
    id: s.id ?? `${kind}-${i}`,
    agentKind: kind,
    name: s.name ?? 'n',
    fullText: '',
    project: 'p',
    workingDir: '/tmp/agent-registry-test-never-live',
    status: 'completed',
    model: { id: 'm', provider: 'x' },
    progress: 100,
    startTime: '2026-01-01T00:00:00.000Z',
    lastActivity: s.lastActivity ?? '2026-01-01T00:00:00.000Z',
    size: 30,
    messageCount: 1,
    toolCalls: 0,
    tools: [],
    openUrl: '',
  }));
  return {
    kind,
    health: async () => ({ kind, online: true }),
    listSessions: async () => full,
    digest: async () => full.map((s) => ({ id: s.id, agentKind: kind, modified: s.lastActivity, messageCount: s.messageCount })),
    listWorkspaces: async () => [],
  };
}

describe('AgentRegistry', () => {
  it('sorts sessions by lastActivity desc', async () => {
    const registry = new AgentRegistry([
      stub('pi', [
        { id: 'old', lastActivity: '2026-01-01T00:00:00.000Z' },
        { id: 'new', lastActivity: '2026-06-01T00:00:00.000Z' },
      ]),
    ]);
    const list = await registry.listSessions();
    expect(list.map((s) => s.id)).toEqual(['new', 'old']);
  });

  it('swallows a failing adapter in digest', async () => {
    const bad: AgentAdapter = {
      kind: 'pi',
      health: async () => ({ kind: 'pi', online: false }),
      listSessions: async () => {
        throw new Error('down');
      },
      digest: async () => {
        throw new Error('down');
      },
      listWorkspaces: async () => {
        throw new Error('down');
      },
    };
    const registry = new AgentRegistry([bad]);
    const d = await registry.digest();
    expect(d.sessions).toEqual([]);
  });
});
