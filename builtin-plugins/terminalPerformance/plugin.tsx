import { lazy, Suspense, type ComponentProps } from 'react';
import type { BoardPlugin } from '@/plugin-system';

const TerminalPerformanceOverlay = lazy(() => import('./TerminalPerformanceOverlay').then((module) => ({
  default: module.TerminalPerformanceOverlay,
})));
const TerminalPerformanceSettingsPanel = lazy(() => import('./settings').then((module) => ({
  default: module.TerminalPerformanceSettingsPanel,
})));

function LazyOverlay(props: ComponentProps<typeof TerminalPerformanceOverlay>) {
  return (
    <Suspense fallback={null}>
      <TerminalPerformanceOverlay {...props} />
    </Suspense>
  );
}

function LazySettings(props: ComponentProps<typeof TerminalPerformanceSettingsPanel>) {
  return (
    <Suspense fallback={null}>
      <TerminalPerformanceSettingsPanel {...props} />
    </Suspense>
  );
}

export const terminalPerformancePlugin: BoardPlugin = {
  id: 'terminal-performance',
  version: '1.0.0',
  titleKey: 'terminalPerformance.title',
  translations: {
    'zh-CN': {
      terminalPerformance: {
        title: '终端性能',
        settings: {
          title: '终端渲染性能预览',
          enabled: '显示性能预览',
          enabledHint: '开发模式默认开启；普通用户可在这里打开或关闭 FPS 和渲染指标。',
        },
        metrics: {
          fps: 'FPS',
          frame: '帧耗时',
        },
      },
    },
    en: {
      terminalPerformance: {
        title: 'Terminal performance',
        settings: {
          title: 'Terminal render preview',
          enabled: 'Show performance preview',
          enabledHint: 'Enabled by default in development. Production users can toggle FPS and render metrics here.',
        },
        metrics: {
          fps: 'FPS',
          frame: 'Frame',
        },
      },
    },
  },
  settings: [{
    id: 'preferences',
    titleKey: 'terminalPerformance.settings.title',
    Settings: LazySettings,
  }],
  overlays: [{
    id: 'fps-preview',
    order: 1000,
    Component: LazyOverlay,
  }],
};
