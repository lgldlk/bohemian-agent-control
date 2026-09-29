import { useMemo } from 'react';
import { useEditor, useValue } from 'tldraw';
import type { Task } from '@/types';
import { BoardPluginErrorBoundary } from '../BoardPluginErrorBoundary';
import { listBoardPlugins } from '../registry';
import { useBoardPluginRuntime } from '../runtimeScope';
import type { BoardPluginTerminalOverlayProps } from '../types';
import { usePluginRuntimeUi } from './hostRuntime';

export function BoardPluginOverlayHost({ tasks }: { tasks: readonly Task[] }) {
  const editor = useEditor();
  const runtime = useBoardPluginRuntime();
  const selectedShapeIds = useValue(
    'plugin-selection',
    () => editor.getSelectedShapeIds(),
    [editor],
  );
  const overlays = useMemo(() => listBoardPlugins()
    .flatMap((plugin) => (plugin.overlays ?? []).map((overlay) => ({
      pluginId: plugin.id,
      overlay,
    })))
    .sort((a, b) => (a.overlay.order ?? 0) - (b.overlay.order ?? 0)), []);

  return (
    <>
      {overlays.map(({ pluginId, overlay }) => {
        const context = runtime.getContext(pluginId);
        if (!context) return null;
        const Component = overlay.Component;
        return (
          <BoardPluginErrorBoundary key={`${pluginId}:${overlay.id}`} pluginId={pluginId}>
            <Component context={context} tasks={tasks} selectedShapeIds={selectedShapeIds} />
          </BoardPluginErrorBoundary>
        );
      })}
    </>
  );
}

export function BoardPluginTerminalOverlayHost(
  props: Omit<BoardPluginTerminalOverlayProps, 'context'>,
) {
  const runtime = usePluginRuntimeUi();
  const overlays = useMemo(() => listBoardPlugins()
    .flatMap((plugin) => (plugin.terminalOverlays ?? []).map((overlay) => ({
      pluginId: plugin.id,
      overlay,
    })))
    .sort((a, b) => (a.overlay.order ?? 0) - (b.overlay.order ?? 0)), []);

  return (
    <>
      {overlays.map(({ pluginId, overlay }) => {
        const context = runtime.getContext(pluginId);
        if (!context) return null;
        const overlayProps = { ...props, context };
        try {
          if (overlay.shouldRender && !overlay.shouldRender(overlayProps)) return null;
        } catch (error) {
          console.error(
            `[board-plugin:${pluginId}] terminal overlay ${overlay.id} predicate failed`,
            error,
          );
          return null;
        }
        const Component = overlay.Component;
        return (
          <BoardPluginErrorBoundary key={`${pluginId}:${overlay.id}`} pluginId={pluginId}>
            <Component {...overlayProps} />
          </BoardPluginErrorBoundary>
        );
      })}
    </>
  );
}
