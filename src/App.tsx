import { lazy, Suspense, useMemo } from 'react';
import WatchGrid from '@/components/WatchGrid';
import BoardHeader from '@/components/BoardHeader';
import { useSpaceStore, spaceIdList } from '@/space/spaceStore';
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
import '@/styles/pixel.css';

export default function App() {
  const { t } = useTranslation();
  const {
    view,
    setView,
    search,
    setSearch,
    addModalOpen,
    addPresetGroup,
    addMode,
    openAddModal,
    closeAddModal,
  } = useAppState();

  const { tasks, error, lastUpdate, refresh, changedIds } = useTasks();
  const groups = useSpaceStore((s) => s.groups);
  const removeFromSpace = useSpaceStore((s) => s.removeFromSpace);
  const spaceIds = useMemo(() => spaceIdList(groups), [groups]);
  const pending = useWorkspaceStore((s) => s.pending);
  const lastUsed = useWorkspaceStore((s) => s.lastUsed);

  const mergedTasks = useMemo(() => {
    const extra = pending.map(pendingToTask);
    const ids = new Set(tasks.map((task) => task.id));
    return [...tasks, ...extra.filter((task) => !ids.has(task.id))];
  }, [pending, tasks]);
  const byId = useMemo(() => new Map(mergedTasks.map((task) => [task.id, task])), [mergedTasks]);
  const spaceTasks = useMemo(
    () => spaceIds.map((id) => byId.get(id)).filter((task): task is Task => !!task),
    [byId, spaceIds],
  );

  const { terminalClient, openTerminalForTask, createNewTerminal } = useTerminalManagement(
    mergedTasks,
    view,
    setView,
  );
  const { start: startThread } = useAgentLaunchController(tasks, openTerminalForTask);


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

  return (
    <div className="px-bg-grid flex h-screen flex-col text-zinc-100">
      <BoardHeader
        taskCount={tasks.length}
        spaceCount={spaceTasks.length}
        lastUpdate={lastUpdate}
        onRefresh={refresh}
        view={view}
        onViewChange={setView}
        search={search}
        onSearch={setSearch}
        onNewTerminal={createNewTerminal}
      />

      <div className="flex min-h-0 flex-1">
        <main className="relative min-w-0 flex-1">
          {error && tasks.length === 0 ? (
            <ErrorBox message={error} onRetry={refresh} />
          ) : view === 'board' ? (
            <Suspense fallback={<div className="flex h-full items-center justify-center text-xs text-zinc-500">Loading board...</div>}>
              <BoardWorkspace
                tasks={mergedTasks}
                groups={groups}
                spaceIds={spaceIds}
                lastUpdate={lastUpdate}
                search={search}
                terminalClient={terminalClient}
                onOpenTerminal={openTerminalForTask}
                onBlankDoubleClick={(groupId) => openAddModal(groupId, 'start')}
              />
            </Suspense>
          ) : (
            <div className="h-full overflow-y-auto p-4 sm:p-6">
              <WatchGrid
                groups={groups}
                byId={byId}
                changedIds={changedIds}
                search={search}
                onRemove={removeFromSpace}
                onSelectTerminal={openTerminalForTask}
                onAdd={openAddModal}
              />
            </div>
          )}
        </main>
      </div>

      <footer className="shrink-0 border-t border-zinc-800/80 py-2 text-center">
        <span className="text-xs text-zinc-600">{t('app.footer')}</span>
      </footer>

      {addModalOpen ? (
        <Suspense fallback={null}>
          <SpaceAddModal
            open
            tasks={tasks}
            presetGroupId={addPresetGroup}
            mode={addMode}
            hintCwd={hintCwd}
            onClose={closeAddModal}
            onStart={(cwd, agentKind) => {
              startThread(cwd, addPresetGroup, agentKind);
              closeAddModal();
            }}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
