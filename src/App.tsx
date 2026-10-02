import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import WatchGrid from '@/components/WatchGrid';
import BoardHeader from '@/components/BoardHeader';
import { useSpaceStore, setActiveBoardIdReader, syncActiveGroups } from '@/space/spaceStore';
import { useBoardWorkspaceStore } from '@/board/boardWorkspaceStore';
import { useBoardMembership } from '@/board/boardMembershipStore';
import { resolveBoardProjection } from '@/board/boardMembership';
const BoardWorkspace = lazy(() => import('@/board/BoardWorkspace'));
const SpaceAddModal = lazy(() => import('@/space/SpaceAddModal'));
import { ErrorBox } from '@/components/LoadingAndError';
import { useTasks } from '@/hooks/useTasks';
import { useAppState } from '@/hooks/useAppState';
import { useAgentLaunchController } from '@/hooks/useAgentLaunchController';
import { useTerminalManagement } from '@/hooks/useTerminalManagement';
import { useTranslation } from 'react-i18next';
import { pendingToTask, useWorkspaceStore } from '@/workspace/workspaceStore';
import type { Task } from '@/types';
import { onResourceActivated } from '@/resources/resourceBus';
const ResourceInspector = lazy(() => import('@/resources/ResourceInspector').then(({ ResourceInspector: Component }) => ({ default: Component })));
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import '@/styles/pixel.css';

const EMPTY_LEGACY_GROUPS: import('@/space/spaceStore').SpaceGroup[] = [];

async function createBusinessGroupFrame(
  groupId: string,
  name: string,
  point: { x: number; y: number },
): Promise<void> {
  const [{ getBoardEditor }, { createNamedGroupFrameAtPoint }] = await Promise.all([
    import('@/board/boardEditor'),
    import('@/board/groupFrameEditor'),
  ]);
  const editor = getBoardEditor();
  if (editor) createNamedGroupFrameAtPoint(editor, groupId, name.trim(), point);
}

export default function App() {
  const { t } = useTranslation();
  const [resource, setResource] = useState<TerminalResourceRef | null>(null);

  useEffect(() => onResourceActivated(setResource), []);
  const {
    view,
    setView,
    search,
    setSearch,
    addModalOpen,
    addPresetGroup,
    addMode,
    addPoint,
    openAddModal,
    closeAddModal,
  } = useAppState();

  const { tasks, error, lastUpdate, refresh, changedIds } = useTasks();
  const activeBoardId = useBoardWorkspaceStore((state) => state.activeBoardId);
  const groupsByBoard = useSpaceStore((state) => state.groupsByBoard);
  const legacyGroups = groupsByBoard[activeBoardId] ?? EMPTY_LEGACY_GROUPS;
  const createGroup = useSpaceStore((s) => s.createGroup);
  const pending = useWorkspaceStore((s) => s.pending);
  const lastUsed = useWorkspaceStore((s) => s.lastUsed);

  // Let the space store resolve "current board" without importing board state.
  useEffect(() => {
    setActiveBoardIdReader(() => useBoardWorkspaceStore.getState().activeBoardId);
    syncActiveGroups();
  }, []);

  const mergedTasks = useMemo(() => {
    const extra = pending.map(pendingToTask);
    const ids = new Set(tasks.map((task) => task.id));
    return [...tasks, ...extra.filter((task) => !ids.has(task.id))];
  }, [pending, tasks]);
  const byId = useMemo(() => new Map(mergedTasks.map((task) => [task.id, task])), [mergedTasks]);

  // Board membership is the canvas projection, not a separate membership list.
  const membership = useBoardMembership(mergedTasks);
  // One-time bridge for boards created before canvas membership became the
  // source of truth. Existing cards always take precedence over saved membership.
  const boardProjection = resolveBoardProjection(membership, legacyGroups);
  const groups = boardProjection.groups;
  const spaceIds = boardProjection.taskIds;
  const boardTasks = useMemo(() => {
    const ids = new Set([...spaceIds, ...pending.map((thread) => thread.id)]);
    return mergedTasks.filter((task) => ids.has(task.id));
  }, [mergedTasks, pending, spaceIds]);
  const spaceTasks = useMemo(
    () => spaceIds.map((id) => byId.get(id)).filter((task): task is Task => !!task),
    [byId, spaceIds],
  );

  const { terminalClient, openTerminalForTask, addEmptyTerminal } = useTerminalManagement(
    mergedTasks,
    view,
    setView,
  );
  const { start: startThread } = useAgentLaunchController(mergedTasks, openTerminalForTask);


  const hintCwd = useMemo(() => {
    const group = groups.find((item) => item.id === addPresetGroup);
    if (!group) return lastUsed;
    const counts = new Map<string, number>();
    for (const id of group.taskIds) {
      const task = byId.get(id);
      if (task?.workingDir) counts.set(task.workingDir, (counts.get(task.workingDir) ?? 0) + 1);
    }
    let best = '';
    let n = 0;
    for (const [path, count] of counts) {
      if (count > n) {
        best = path;
        n = count;
      }
    }
    return best || lastUsed;
  }, [addPresetGroup, byId, groups, lastUsed]);

  function handleRemoveTaskCard(taskId: string): void {
    void import('@/board/boardEditor').then(({ removeTaskCardShape }) => removeTaskCardShape(taskId));
  }

  function handleCreateGroup(name: string): void {
    const groupId = createGroup(name);
    if (groupId && addPoint) void createBusinessGroupFrame(groupId, name, addPoint);
    closeAddModal();
  }

  async function handleStartThread(cwd: string, agentKind: string, groupId?: string): Promise<void> {
    await startThread(cwd, groupId, agentKind);
    closeAddModal();
  }

  function handleBlankBoardDoubleClick(x: number, y: number, groupId?: string): void {
    openAddModal(groupId, 'start', { x, y });
  }

  return (
    <div className="px-bg-grid flex h-screen flex-col text-zinc-100">
      <BoardHeader
        taskCount={tasks.length}
        spaceCount={spaceTasks.length}
        view={view}
        onViewChange={setView}
        search={search}
        onSearch={setSearch}
        onAddTerminal={addEmptyTerminal}
      />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {error && tasks.length === 0 ? (
            <ErrorBox message={error} onRetry={refresh} />
          ) : (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-zinc-500">Loading board...</div>}>
              <div className="absolute inset-0">
                <div className={view === 'board' ? 'absolute inset-0' : 'hidden'}>
                  <BoardWorkspace
                    boardId={activeBoardId}
                    tasks={boardTasks}
                    allTasks={mergedTasks}
                    groups={groups}
                    spaceIds={spaceIds}
                    hasLegacyMembership={legacyGroups.some((group) => group.taskIds.length > 0)}
                    lastUpdate={lastUpdate}
                    search={search}
                    terminalClient={terminalClient}
                    onOpenTerminal={openTerminalForTask}
                    onBlankDoubleClick={handleBlankBoardDoubleClick}
                  />
                </div>
                {view === 'grid' ? (
                  <div className="absolute inset-0 z-10 h-full overflow-y-auto bg-zinc-950 p-4 sm:p-6">
                    <WatchGrid
                      groups={groups}
                      byId={byId}
                      changedIds={changedIds}
                      search={search}
                      onRemove={handleRemoveTaskCard}
                      onSelectTerminal={openTerminalForTask}
                      onAdd={openAddModal}
                    />
                  </div>
                ) : null}
              </div>
            </Suspense>
          )}
        </main>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/80 py-2 text-center">
        <span className="text-xs text-zinc-600">{t('app.footer')}</span>
      </footer>

      {resource ? (
        <Suspense fallback={null}>
          <ResourceInspector resource={resource} onClose={() => setResource(null)} />
        </Suspense>
      ) : null}

      {addModalOpen ? (
        <Suspense fallback={null}>
          <SpaceAddModal
            open
            tasks={tasks}
            presetGroupId={addPresetGroup}
            mode={addMode}
            hintCwd={hintCwd}
            onClose={closeAddModal}
            onCreateGroup={handleCreateGroup}
            onStart={handleStartThread}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
