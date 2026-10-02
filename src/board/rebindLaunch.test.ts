import { afterEach, describe, expect, it } from 'vitest';
import type { Editor } from 'tldraw';
import type { TerminalInfo } from '@bohemian/terminal-protocol';
import { setBoardTasks } from './taskSnapshot';
import { rebindLaunchCards, sessionRebindSources } from './rebindLaunch';

function terminal(overrides: Partial<TerminalInfo>): TerminalInfo {
  return {
    id: 'terminal-1',
    title: 'Terminal',
    cwd: '/tmp/project',
    shell: '/bin/zsh',
    status: 'running',
    createdAt: 1,
    updatedAt: 1,
    size: { cols: 80, rows: 24 },
    ...overrides,
  };
}

afterEach(() => {
  setBoardTasks([]);
});

describe('sessionRebindSources', () => {
  it('uses the pending launch as the source for the first session', () => {
    const info = terminal({
      launchId: 'pending-1',
      nodeId: 'session-a',
      agentSessionId: 'session-a',
    });

    expect(sessionRebindSources(info, 'pending-1')).toEqual(['pending-1']);
  });

  it('uses the existing card identity before the original launch after /new', () => {
    const previous = terminal({
      launchId: 'pending-1',
      nodeId: 'session-a',
      agentSessionId: 'session-a',
    });
    const next = terminal({
      launchId: 'pending-1',
      nodeId: 'session-b',
      agentSessionId: 'session-b',
    });

    expect(sessionRebindSources(next, 'session-a', previous)).toEqual([
      'session-a',
      'pending-1',
    ]);
  });

  it('rebinds the existing card and clears stale session metadata after /new', () => {
    const shapes: Array<{ id: string; type: string; props: Record<string, unknown> }> = [
      {
        id: 'shape:card',
        type: 'task-card',
        props: {
          taskId: 'session-a',
          w: 320,
          h: 112,
          name: 'Old title',
          status: 'completed',
          project: 'old-project',
          model: 'old-model',
          provider: 'old-provider',
          agentKind: 'pi',
          customTitle: 'Pinned old title',
          messageCount: 9,
          tokenCount: 99,
          lastActivity: 100,
        },
      },
      {
        id: 'shape:terminal',
        type: 'terminal',
        props: { terminalId: 'terminal-1', nodeId: 'session-a' },
      },
    ];
    const editor = {
      getCurrentPageShapes: () => shapes,
      getShape: (id: string) => shapes.find((shape) => shape.id === id),
      updateShapes: (updates: Array<{ id: string; props: Record<string, unknown> }>) => {
        for (const update of updates) {
          const shape = shapes.find((candidate) => candidate.id === update.id);
          if (shape) shape.props = { ...shape.props, ...update.props };
        }
      },
    } as unknown as Editor;

    const previous = terminal({
      launchId: 'pending-1',
      nodeId: 'session-a',
      agentSessionId: 'session-a',
    });
    const next = terminal({
      launchId: 'pending-1',
      nodeId: 'session-b',
      agentSessionId: 'session-b',
    });

    expect(rebindLaunchCards(editor, [next], new Map([[previous.id, previous]]))).toBe(1);
    expect(shapes[0].props).toMatchObject({
      taskId: 'session-b',
      name: '',
      status: 'unknown',
      model: '',
      provider: '',
      customTitle: '',
      messageCount: 0,
      tokenCount: 0,
    });
    expect(shapes[1].props.nodeId).toBe('session-b');
    // Membership is the canvas: the card was rebound, no side list to assert.
    expect(shapes.filter((shape) => shape.type === 'task-card').map((s) => s.props.taskId)).toEqual(['session-b']);
  });

  it('adopts an existing resumed topic without creating a duplicate card', () => {
    const shapes: Array<{
      id: string;
      type: string;
      x: number;
      y: number;
      props: Record<string, unknown>;
      meta?: Record<string, unknown>;
    }> = [
      { id: 'shape:old', type: 'task-card', x: 0, y: 0, props: {
        taskId: 'session-a', w: 320, h: 112, name: 'Topic A', status: 'completed', project: 'project',
        model: 'model-a', provider: 'provider', agentKind: 'pi', customTitle: '', messageCount: 3,
        tokenCount: 30, lastActivity: 100,
      } },
      { id: 'shape:resumed', type: 'task-card', x: 800, y: 0, props: {
        taskId: 'session-b', w: 320, h: 112, name: 'Topic B', status: 'completed', project: 'project',
        model: 'model-b', provider: 'provider', agentKind: 'pi', customTitle: 'Keep topic B', messageCount: 7,
        tokenCount: 70, lastActivity: 200,
      } },
      { id: 'shape:terminal', type: 'terminal', x: 0, y: 180, props: {
        terminalId: 'terminal-1', nodeId: 'session-a', w: 720, h: 440,
      } },
    ];
    const editor = {
      getCurrentPageShapes: () => shapes,
      getShape: (id: string) => shapes.find((shape) => shape.id === id),
      getShapePageBounds: (id: string) => {
        const shape = shapes.find((candidate) => candidate.id === id);
        return shape ? { x: shape.x, y: shape.y, w: Number(shape.props.w ?? 0), h: Number(shape.props.h ?? 0) } : undefined;
      },
      updateShapes: (updates: Array<{ id: string; props: Record<string, unknown> }>) => {
        for (const update of updates) {
          const shape = shapes.find((candidate) => candidate.id === update.id);
          if (shape) shape.props = { ...shape.props, ...update.props };
        }
      },
      createShapes: (created: typeof shapes) => shapes.push(...created),
      createBindings: () => undefined,
      getBindingsToShape: () => [],
      getBindingsFromShape: () => [],
      deleteShapes: (ids: string[]) => {
        for (const id of ids) {
          const index = shapes.findIndex((shape) => shape.id === id);
          if (index >= 0) shapes.splice(index, 1);
        }
      },
    } as unknown as Editor;
    const previous = terminal({ launchId: 'pending-1', nodeId: 'session-a', agentSessionId: 'session-a' });
    const next = terminal({ launchId: 'pending-1', nodeId: 'session-b', agentSessionId: 'session-b' });

    expect(rebindLaunchCards(editor, [next], new Map([[previous.id, previous]]))).toBe(1);
    expect(shapes.filter((shape) => shape.type === 'task-card').map((shape) => shape.props.taskId)).toEqual(['session-b']);
    expect(shapes.find((shape) => shape.id === 'shape:resumed')?.props.customTitle).toBe('Keep topic B');
    expect(shapes.find((shape) => shape.id === 'shape:terminal')?.props.nodeId).toBe('session-b');
    // The duplicate old-topic card is deleted from the canvas; the resumed one stays.
    expect(shapes.some((shape) => shape.id === 'shape:old')).toBe(false);
  });
});
