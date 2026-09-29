import { useTranslation } from 'react-i18next';
import {
  boardPluginPanelKey,
  openBoardPluginPage,
  toggleBoardPlugin,
  useActiveBoardPluginId,
  useActiveBoardPluginPageId,
} from '../pluginStore';
import { listBoardPlugins } from '../registry';
import { invokePluginAction, safePluginValue, usePluginRuntimeUi } from './hostRuntime';

export function BoardPluginPageButtons({ onActivatePage }: { onActivatePage?: () => void }) {
  const { t } = useTranslation();
  const activePageId = useActiveBoardPluginPageId();
  usePluginRuntimeUi();
  const pages = listBoardPlugins()
    .flatMap((plugin) => (plugin.pages ?? []).map((page) => ({ plugin, page })))
    .sort((a, b) => (a.page.order ?? 0) - (b.page.order ?? 0));

  return (
    <>
      {pages.map(({ plugin, page }) => {
        const pageId = boardPluginPanelKey(plugin.id, page.id);
        const active = activePageId === pageId;
        return (
          <button
            aria-label={t(page.labelKey)}
            aria-pressed={active}
            className={`px-btn box-shadow-margin h-8 px-3 pixel-font text-[8px] ${active ? 'px-btn-primary' : 'px-btn-dark'}`}
            key={pageId}
            type="button"
            onClick={() => {
              openBoardPluginPage(pageId);
              onActivatePage?.();
            }}
          >
            {t(page.labelKey).toUpperCase()}
          </button>
        );
      })}
    </>
  );
}

export function BoardPluginTopbarButtons() {
  const { t } = useTranslation();
  const activeId = useActiveBoardPluginId();
  const runtime = usePluginRuntimeUi();

  return (
    <div className="flex items-center gap-1">
      {listBoardPlugins().flatMap((plugin) => (plugin.topbar ?? []).map((item) => {
        const context = runtime.getContext(plugin.id);
        const panelActive = item.panelId
          ? activeId === boardPluginPanelKey(plugin.id, item.panelId)
          : false;
        const active = panelActive || Boolean(context && safePluginValue(
          plugin.id,
          `topbar ${item.id} isActive`,
          false,
          () => item.isActive?.(context) ?? false,
        ));
        const disabled = context
          ? safePluginValue(
              plugin.id,
              `topbar ${item.id} disabled`,
              false,
              () => item.disabled?.(context) ?? false,
            )
          : Boolean(item.disabled);
        const badge = context
          ? safePluginValue(
              plugin.id,
              `topbar ${item.id} badge`,
              null,
              () => item.badge?.(context) ?? null,
            )
          : null;
        const Icon = item.icon;

        return (
          <button
            key={`${plugin.id}:${item.id}`}
            type="button"
            title={t(item.labelKey)}
            aria-pressed={active}
            aria-label={t(item.labelKey)}
            disabled={disabled}
            onClick={() => {
              if (item.panelId) toggleBoardPlugin(boardPluginPanelKey(plugin.id, item.panelId));
              else invokePluginAction(plugin.id, item, context);
            }}
            className={`px-btn box-shadow-margin flex h-8 items-center gap-1 px-2 pixel-font text-[8px] ${active ? 'bg-zinc-700 text-white' : 'px-btn-dark'}`}
          >
            <Icon className="h-3 w-3" />
            <span>{t(item.labelKey)}</span>
            {badge !== null && badge !== undefined && <span className="px-badge px-1">{badge}</span>}
          </button>
        );
      }))}
    </div>
  );
}
