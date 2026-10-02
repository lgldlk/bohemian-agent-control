import { useEffect } from 'react';
import EvidenceBoard from './EvidenceBoard';
import { useBoardSync } from './useBoardSync';
import { useBoardOperations } from '@/hooks/useBoardOperations';
import { getBoardTerminalInfos } from './terminalActivity';
import { rebindLaunchCards } from './rebindLaunch';
import { setBoardTasks } from './taskSnapshot';
import { getBoardEditor, subscribeBoardEditor } from './boardEditor';
import { createShapeId } from 'tldraw';
import { taskToCardProps } from './TaskCardShape';
import { FIRST_PAGE_ID } from './boardWorkspaceModel';
import { readLocalJson, writeLocalJson } from '@/lib/localJson';
import type { Task } from '@/types';
import type { SpaceGroup } from '@/space/spaceStore';
import type { TerminalClient } from '@bohemian/terminal-client';

const INITIAL_BOARD_RECOVERY_KEY = 'bohemian-agent-control:canvas-recovery:v2';

function recoveredBoards(): string[] {
  return readLocalJson(INITIAL_BOARD_RECOVERY_KEY, (value) =>
    Array.isArray(value) && value.every((id) => typeof id === 'string') ? value : null, () => []);
}

function createRecoveredCardBatch(tasks: readonly Task[], offset: number) {
  return tasks.map((task, index) => {
    const position = offset + index;
    return {
      id: createShapeId(),
      type: 'task-card' as const,
      x: 80 + (position % 6) * 368,
      y: 80 + Math.floor(position / 6) * 160,
      props: taskToCardProps(task, task.id),
    };
  });
}

function markBoardRecovered(boardId: string): void {
  const current = recoveredBoards();
  if (current.includes(boardId)) return;
  writeLocalJson(INITIAL_BOARD_RECOVERY_KEY, [...current, boardId]);
}

function recoverInitialBoard(
  editor: ReturnType<typeof getBoardEditor>,
  boardId: string,
  tasks: readonly Task[],
  blockedByLegacyGroups: boolean,
): void {
  if (!editor || boardId !== FIRST_PAGE_ID || blockedByLegacyGroups || tasks.length === 0) return;
  if (recoveredBoards().includes(boardId)) return;

  const existingTaskIds = new Set(editor.getCurrentPageShapes()
    .filter((shape) => shape.type === 'task-card')
    .map((shape) => String((shape.props as { taskId?: string }).taskId ?? ''))
    .filter(Boolean));
  const uniqueTasks = [...new Map(tasks.map((task) => [task.id, task])).values()];
  const missingTasks = uniqueTasks.filter((task) => !existingTaskIds.has(task.id));
  if (missingTasks.length === 0) {
    markBoardRecovered(boardId);
    return;
  }

  for (let offset = 0; offset < missingTasks.length; offset += 40) {
    editor.createShapes(createRecoveredCardBatch(missingTasks.slice(offset, offset + 40), offset));
  }

  const recoveredTaskIds = new Set(editor.getCurrentPageShapes()
    .filter((shape) => shape.type === 'task-card')
    .map((shape) => String((shape.props as { taskId?: string }).taskId ?? '')));
  if (uniqueTasks.every((task) => recoveredTaskIds.has(task.id))) markBoardRecovered(boardId);
}

export interface BoardWorkspaceProps {
  /** Active board id; page-scoped sync and group projection key off it. */
  boardId: string;
  /** Agents on the active board. */
  tasks: Task[];
  /** Every known Agent, for global lookups such as launch rebinding. */
  allTasks?: Task[];
  groups: SpaceGroup[];
  spaceIds: string[];
  /** Existing membership data from the pre-canvas source-of-truth build. */
  hasLegacyMembership: boolean;
  lastUpdate: Date | null;
  search: string;
  terminalClient: TerminalClient;
  onOpenTerminal: (taskId: string) => void;
  onBlankDoubleClick: (x: number, y: number, groupId?: string) => void;
}

export default function BoardWorkspace({
  boardId,
  tasks,
  allTasks,
  groups,
  spaceIds,
  hasLegacyMembership,
  lastUpdate,
  search,
  terminalClient,
  onOpenTerminal,
  onBlankDoubleClick,
}: BoardWorkspaceProps) {
  const { dropPointRef, dropToBoard } = useBoardOperations(
    new Map(tasks.map((task) => [task.id, task])),
  );

  // The canvas is the source of board membership, so the projection must be live
  // for the whole time the board is mounted.
  useEffect(() => {
    setBoardTasks(allTasks ?? tasks);
  }, [allTasks, tasks]);

  useEffect(() => {
    let attachVersion = 0;
    let stopObservation: (() => void) | undefined;
    async function attachMembershipObserver(): Promise<void> {
      const version = ++attachVersion;
      stopObservation?.();
      stopObservation = undefined;
      const editor = getBoardEditor();
      if (!editor) return;
      const { observeBoardMembership } = await import('./boardMembershipObserver');
      if (version !== attachVersion || getBoardEditor() !== editor) return;
      stopObservation = observeBoardMembership(editor);
    }
    void attachMembershipObserver();
    const stopEditorSubscription = subscribeBoardEditor(() => void attachMembershipObserver());
    return () => {
      attachVersion += 1;
      stopEditorSubscription();
      stopObservation?.();
    };
  }, [boardId]);

  useEffect(() => {
    recoverInitialBoard(getBoardEditor(), boardId, allTasks ?? [], hasLegacyMembership);
  }, [allTasks, boardId, hasLegacyMembership]);

  useEffect(() => {
    const editor = getBoardEditor();
    if (editor) rebindLaunchCards(editor, getBoardTerminalInfos().values());
  }, [allTasks, tasks]);

  useBoardSync({
    enabled: true,
    boardId,
    tasks,
    groups,
    spaceIds,
    lastUpdate,
    dropPoint: dropPointRef.current,
  });

  return (
    <EvidenceBoard
      tasks={tasks}
      allTasks={allTasks ?? tasks}
      search={search}
      terminalClient={terminalClient}
      onOpenTerminal={onOpenTerminal}
      onDropNewTask={dropToBoard}
      onBlankDoubleClick={(x, y, groupId) => {
        dropPointRef.current = { x, y };
        onBlankDoubleClick(x, y, groupId);
      }}
    />
  );
}
