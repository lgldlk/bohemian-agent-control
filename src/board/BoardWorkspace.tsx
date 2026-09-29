import { useEffect } from 'react';
import EvidenceBoard from './EvidenceBoard';
import { useBoardSync } from './useBoardSync';
import { useBoardOperations } from '@/hooks/useBoardOperations';
import { getBoardTerminalInfos } from './terminalActivity';
import { rebindLaunchCards } from './rebindLaunch';
import { setBoardTasks } from './taskSnapshot';
import { getBoardEditor } from './boardEditor';
import type { Task } from '@/types';
import type { SpaceGroup } from '@/space/spaceStore';
import type { TerminalClient } from '@bohemian/terminal-client';

export interface BoardWorkspaceProps {
  tasks: Task[];
  groups: SpaceGroup[];
  spaceIds: string[];
  lastUpdate: Date | null;
  search: string;
  terminalClient: TerminalClient;
  onOpenTerminal: (taskId: string) => void;
  onBlankDoubleClick: (x: number, y: number, groupId?: string) => void;
}

export default function BoardWorkspace({
  tasks,
  groups,
  spaceIds,
  lastUpdate,
  search,
  terminalClient,
  onOpenTerminal,
  onBlankDoubleClick,
}: BoardWorkspaceProps) {
  const { dropPointRef, dropToBoard } = useBoardOperations(
    new Map(tasks.map((task) => [task.id, task])),
  );

  setBoardTasks(tasks);

  useEffect(() => {
    const editor = getBoardEditor();
    if (editor) rebindLaunchCards(editor, getBoardTerminalInfos().values());
  }, [tasks]);

  useBoardSync({
    enabled: true,
    tasks,
    groups,
    spaceIds,
    lastUpdate,
    dropPoint: dropPointRef.current,
  });

  return (
    <EvidenceBoard
      tasks={tasks}
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
