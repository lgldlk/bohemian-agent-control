import { useTranslation } from 'react-i18next';
import { TldrawUiButtonIcon, TldrawUiToolbarButton, useEditor, useValue } from 'tldraw';
import { boardPluginPanelKey, toggleBoardPlugin, useActiveBoardPluginId } from '../pluginStore';
import { listBoardPlugins } from '../registry';
import { useBoardPluginRuntime } from '../runtimeScope';
import { invokePluginAction, safePluginValue } from './hostRuntime';

function usePluginToolbarState(): void {
  const editor = useEditor();
  useValue('plugin-toolbar-state', () => editor.getSelectedShapeIds().join('|'), [editor]);
}

export function BoardPluginToolbarButtons() {
  const { t } = useTranslation();
  const activeId = useActiveBoardPluginId();
  const runtime = useBoardPluginRuntime();
  usePluginToolbarState();
  const plugins = listBoardPlugins();

  return (
    <>
      {plugins.flatMap((plugin) => (plugin.toolbar ?? []).map((item) => {
        const context = runtime.getContext(plugin.id);
        const panelActive = item.panelId
          ? activeId === boardPluginPanelKey(plugin.id, item.panelId)
          : false;
        const active = panelActive || Boolean(context && safePluginValue(
          plugin.id,
          `toolbar ${item.id} isActive`,
          false,
          () => item.isActive?.(context) ?? false,
        ));
        const disabled = context
          ? safePluginValue(
              plugin.id,
              `toolbar ${item.id} disabled`,
              false,
              () => item.disabled?.(context) ?? false,
            )
          : Boolean(item.disabled);

        return (
          <TldrawUiToolbarButton
            key={`${plugin.id}:${item.id}`}
            type="tool"
            title={t(item.labelKey)}
            isActive={active}
            disabled={disabled}
            onClick={() => {
              if (item.panelId) toggleBoardPlugin(boardPluginPanelKey(plugin.id, item.panelId));
              else invokePluginAction(plugin.id, item, context);
            }}
          >
            <TldrawUiButtonIcon icon={item.icon} />
          </TldrawUiToolbarButton>
        );
      }))}
    </>
  );
}
