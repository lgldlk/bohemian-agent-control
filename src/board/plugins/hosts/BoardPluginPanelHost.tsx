import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor } from 'tldraw';
import { focusTaskShape as focusTaskShapeOnEditor } from '@/board/boardSync';
import type { Task } from '@/types';
import { BoardPluginErrorBoundary } from '../BoardPluginErrorBoundary';
import {
  closeBoardPlugin,
  closeBoardPluginPage,
  parseBoardPluginPanelKey,
  useActiveBoardPluginId,
  useActiveBoardPluginPageId,
} from '../pluginStore';
import { findBoardPlugin } from '../registry';
import { createBoardPluginSettingsStorage, createPluginContentStorage } from '../storage';

export function BoardPluginPageOverlayHost({ tasks }: { tasks: readonly Task[] }) {
  const editor = useEditor();
  const activePageId = useActiveBoardPluginPageId();
  const parsed = parseBoardPluginPanelKey(activePageId);
  const [pluginId, pageContributionId] = parsed ?? [];
  const plugin = pluginId ? findBoardPlugin(pluginId) : undefined;
  const page = plugin?.pages?.find((item) => item.id === pageContributionId);
  if (!plugin || !page) return null;
  const Page = page.Page;

  return (
    <div className="pointer-events-auto absolute inset-0 z-[165000] overflow-hidden bg-[#0a0a0d]">
      <BoardPluginErrorBoundary
        pluginId={plugin.id}
        fallback={<div role="alert" className="p-6 text-sm text-zinc-500">Plugin page unavailable</div>}
      >
        <Page
          tasks={tasks}
          onFocusTask={(taskId) => {
            closeBoardPluginPage();
            window.requestAnimationFrame(() => focusTaskShapeOnEditor(editor, taskId));
          }}
        />
      </BoardPluginErrorBoundary>
    </div>
  );
}

export function BoardPluginPanel({ tasks }: { tasks: readonly Task[] }) {
  const editor = useEditor();
  const { t } = useTranslation();
  const activeId = useActiveBoardPluginId();
  const parsedActiveId = parseBoardPluginPanelKey(activeId);
  const [pluginId, panelId] = parsedActiveId ?? [];
  const plugin = pluginId ? findBoardPlugin(pluginId) : undefined;
  const panel = plugin?.panels?.find((item) => item.id === panelId);
  const contentStorage = useMemo(
    () => plugin ? createPluginContentStorage(editor, plugin.id) : null,
    [editor, plugin?.id],
  );
  const settingsStorage = useMemo(
    () => plugin ? createBoardPluginSettingsStorage(plugin.id) : null,
    [plugin?.id],
  );
  if (!plugin || !panel || !contentStorage || !settingsStorage) return null;
  const Panel = panel.Panel;

  return (
    <aside className="absolute bottom-3 right-3 top-3 z-[170000] flex w-[380px] max-w-[calc(100%-24px)] flex-col border border-zinc-700 bg-zinc-950 shadow-2xl">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800 px-3">
        <h2 className="min-w-0 flex-1 truncate text-[13px] text-zinc-100">
          {t(panel.titleKey)}
        </h2>
        <button
          type="button"
          className="text-[12px] text-zinc-500 hover:text-white"
          onClick={closeBoardPlugin}
        >
          {t('plugins.close')}
        </button>
      </header>
      <BoardPluginErrorBoundary
        key={`${plugin.id}:${panel.id}`}
        pluginId={plugin.id}
        fallback={<div role="alert" className="p-4 text-xs text-zinc-500">Plugin panel unavailable</div>}
      >
        <Panel
          tasks={tasks}
          onFocusTask={(taskId) => focusTaskShapeOnEditor(editor, taskId)}
          contentStorage={contentStorage}
          settingsStorage={settingsStorage}
        />
      </BoardPluginErrorBoundary>
    </aside>
  );
}
