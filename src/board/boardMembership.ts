import type { Task } from '@/types';
import type { SpaceGroup } from '@/space/spaceStore';

/**
 * Board membership projection.
 *
 * A board's members *are* the task cards on its canvas. There is no separate
 * membership list to drift out of sync: add a card and the Agent joins the
 * board, remove it and the Agent leaves. Groups are tldraw frames, so moving a
 * card into a frame regroups it without any extra bookkeeping.
 *
 * This module is pure so the projection can be tested without tldraw or React.
 */

export const UNGROUPED_ID = 'default';

export interface BoardCardRef {
  taskId: string;
  /** Business group id, or UNGROUPED_ID when the card is loose on the page. */
  groupId: string;
  /** Frame name when the card sits in a business group frame. */
  groupName: string;
}

export interface BoardMembership {
  /** Members in canvas order, de-duplicated by task id. */
  taskIds: string[];
  /** Members that resolve to a known Task, in canvas order. */
  tasks: Task[];
  /** Groups built from the frames present on this board. */
  groups: SpaceGroup[];
  /** True when the task id is on this board. */
  has(taskId: string): boolean;
}

function hasNoMembership(_taskId: string): boolean {
  return false;
}

function emptyMembership(ungroupedName: string): BoardMembership {
  const taskIds: string[] = [];
  return {
    taskIds,
    tasks: [],
    groups: [{ id: UNGROUPED_ID, name: ungroupedName, taskIds: [], collapsed: false }],
    has: hasNoMembership,
  };
}

/**
 * Projects the canvas onto board membership.
 *
 * Order follows the card list, so the count, the Agent navigator and the header
 * all agree without consulting a second store.
 */
export function projectBoardMembership(
  cards: readonly BoardCardRef[],
  tasksById: ReadonlyMap<string, Task>,
  ungroupedName: string,
): BoardMembership {
  if (cards.length === 0) return emptyMembership(ungroupedName);

  const seen = new Set<string>();
  const named = new Map<string, SpaceGroup>();
  const ungrouped: string[] = [];
  const ordered: string[] = [];

  for (const card of cards) {
    if (!card.taskId || seen.has(card.taskId)) continue;
    seen.add(card.taskId);
    ordered.push(card.taskId);
    if (card.groupId && card.groupId !== UNGROUPED_ID) {
      const group = named.get(card.groupId) ?? {
        id: card.groupId,
        name: card.groupName || card.groupId,
        taskIds: [],
        collapsed: false,
      };
      group.taskIds.push(card.taskId);
      named.set(card.groupId, group);
    } else {
      ungrouped.push(card.taskId);
    }
  }

  const tasks = ordered
    .map((taskId) => tasksById.get(taskId))
    .filter((task): task is Task => task !== undefined);

  function hasTask(taskId: string): boolean {
    return seen.has(taskId);
  }

  return {
    taskIds: ordered,
    tasks,
    groups: [{ id: UNGROUPED_ID, name: ungroupedName, taskIds: ungrouped, collapsed: false }, ...named.values()],
    has: hasTask,
  };
}

/** Task ids present on the canvas, for reconciliation and diagnostics. */
export function boardTaskIds(cards: readonly BoardCardRef[]): Set<string> {
  const ids = new Set<string>();
  for (const card of cards) if (card.taskId) ids.add(card.taskId);
  return ids;
}

/**
 * One-time compatibility bridge from saved memberships to canvas shapes.
 *
 * Existing builds stored board members separately. Until their cards are
 * materialized, use that saved list to hydrate the canvas. Once any card exists,
 * the canvas immediately becomes authoritative, including the intentional empty
 * board case when no legacy membership was saved.
 */
export function resolveBoardProjection(
  canvas: BoardMembership,
  legacyGroups: readonly SpaceGroup[],
): { groups: SpaceGroup[]; taskIds: string[]; needsLegacyHydration: boolean } {
  if (canvas.taskIds.length > 0 || legacyGroups.length === 0) {
    return { groups: canvas.groups, taskIds: canvas.taskIds, needsLegacyHydration: false };
  }
  const taskIds = [...new Set(legacyGroups.flatMap((group) => group.taskIds))];
  return {
    groups: legacyGroups.map((group) => ({ ...group, taskIds: [...group.taskIds] })),
    taskIds,
    needsLegacyHydration: taskIds.length > 0,
  };
}
