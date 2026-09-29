import type { Editor, TLShapeId } from 'tldraw';
import type { TerminalInfo } from '@bohemian/terminal-protocol';
import { boundSessionId } from '@/domain/terminalIdentity';
import { useSpaceStore } from '@/space/spaceStore';
import { useWorkspaceStore } from '@/workspace/workspaceStore';
import { findTaskShape } from './boardShapes';
import { cardPropsChanged, taskToCardProps, type TaskCardShapeProps } from './TaskCardShape';
import { getBoardTasks } from './taskSnapshot';
import { connectShapes } from './boardTerminals';
import { collectDependentShapeIds } from './events/boardNodeGraph';

interface TerminalShapeIdentity {
  id: TLShapeId;
  nodeId: string;
}

export function sessionRebindSources(
  info: TerminalInfo,
  terminalNodeId?: string,
  previous?: TerminalInfo,
): string[] {
  const target = boundSessionId(info);
  if (!target) return [];
  return [...new Set([
    previous ? boundSessionId(previous) : undefined,
    previous?.nodeId,
    terminalNodeId,
    info.launchId,
  ].filter((id): id is string => Boolean(id) && id !== target))];
}

/**
 * Keep one card attached to the Agent currently running in a PTY. This handles
 * pending-launch binding plus in-terminal topic switches such as `/new` and `/resume`.
 */
export function rebindLaunchCards(
  editor: Editor,
  infos: Iterable<TerminalInfo>,
  previousInfos: ReadonlyMap<string, TerminalInfo> = new Map(),
): number {
  const tasks = getBoardTasks();
  const updates: Array<{ id: TLShapeId; type: 'task-card'; props: Partial<TaskCardShapeProps> }> = [];
  let rebound = 0;

  for (const info of infos) {
    const target = boundSessionId(info);
    if (!target) continue;

    const terminalShape = terminalShapeIdentity(editor, info.id);
    const sources = sessionRebindSources(info, terminalShape?.nodeId, previousInfos.get(info.id));
    const space = useSpaceStore.getState();
    const source = sources.find((id) =>
      Boolean(findTaskShape(editor, id)) || space.groups.some((group) => group.taskIds.includes(id)),
    );

    const sourceCard = source ? findTaskShape(editor, source) : null;
    const targetCard = findTaskShape(editor, target);
    const duplicateTarget = Boolean(sourceCard && targetCard && sourceCard !== targetCard);
    const cardId = duplicateTarget ? targetCard : sourceCard ?? targetCard;
    if (cardId) {
      const current = editor.getShape(cardId)?.props as TaskCardShapeProps | undefined;
      const task = tasks.get(target);
      const base = taskToCardProps(task, target);
      const isNewTopic = Boolean(source && !source.startsWith('pending-'));
      const preserveCustomTitle = duplicateTarget || !isNewTopic;
      const next: Partial<TaskCardShapeProps> = {
        ...base,
        customTitle: preserveCustomTitle ? current?.customTitle ?? '' : '',
        w: current?.w ?? base.w,
        h: current?.h ?? base.h,
      };
      const changed = !current
        || current.taskId !== target
        || cardPropsChanged(current, { ...current, ...next } as TaskCardShapeProps);
      if (changed) updates.push({ id: cardId, type: 'task-card', props: next });
    }

    if (terminalShape && terminalShape.nodeId !== target) {
      editor.updateShapes([{
        id: terminalShape.id,
        type: 'terminal',
        props: { nodeId: target },
      }]);
    }

    if (source) {
      const sourceGroup = space.groups.find((group) => group.taskIds.includes(source));
      const targetGrouped = space.groups.some((group) => group.taskIds.includes(target));
      const otherSourceTerminal = editor.getCurrentPageShapes().some((shape) =>
        shape.type === 'terminal'
        && shape.id !== terminalShape?.id
        && (shape.props as { nodeId?: string }).nodeId === source,
      );

      if (duplicateTarget && sourceCard && targetCard && !otherSourceTerminal) {
        if (terminalShape) {
          connectShapes(editor, targetCard, terminalShape.id, linkDirection(editor, targetCard, terminalShape.id));
        }
        if (!targetGrouped && sourceGroup) space.addToGroup(target, sourceGroup.id);
        space.removeFromSpace(source);
        const sourceShape = editor.getShape(sourceCard);
        if (sourceShape) {
          const dependents = collectDependentShapeIds(editor, sourceShape)
            .filter((id) => id !== terminalShape?.id && id !== targetCard);
          editor.deleteShapes([sourceCard, ...dependents]);
        }
        rebound += 1;
      } else if (!duplicateTarget) {
        if (sourceGroup) {
          space.rebindTaskId(source, target);
          rebound += 1;
        } else if (sourceCard) {
          space.addToGroup(target);
          rebound += 1;
        }
      }
      if (source.startsWith('pending-')) useWorkspaceStore.getState().removePending(source);
    }
  }

  if (updates.length) editor.updateShapes(updates);
  return rebound;
}

function linkDirection(editor: Editor, fromId: TLShapeId, toId: TLShapeId): 'horizontal' | 'vertical' {
  const from = editor.getShapePageBounds(fromId);
  const to = editor.getShapePageBounds(toId);
  if (!from || !to) return 'vertical';
  const dx = Math.abs((from.x + from.w / 2) - (to.x + to.w / 2));
  const dy = Math.abs((from.y + from.h / 2) - (to.y + to.h / 2));
  return dx > dy ? 'horizontal' : 'vertical';
}

function terminalShapeIdentity(editor: Editor, terminalId: string): TerminalShapeIdentity | undefined {
  const shape = editor.getCurrentPageShapes().find((candidate) =>
    candidate.type === 'terminal'
    && (candidate.props as { terminalId?: string }).terminalId === terminalId,
  );
  if (!shape) return undefined;
  return {
    id: shape.id,
    nodeId: (shape.props as { nodeId?: string }).nodeId ?? '',
  };
}
