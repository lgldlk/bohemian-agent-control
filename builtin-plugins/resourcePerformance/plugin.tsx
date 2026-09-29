import { lazy, Suspense, type ComponentProps } from 'react';
import type { BoardPlugin } from '@/plugin-system';

const ResourcePerformanceSettingsPanel = lazy(() => import('./settings').then((module) => ({
  default: module.ResourcePerformanceSettingsPanel,
})));

function LazySettings(props: ComponentProps<typeof ResourcePerformanceSettingsPanel>) {
  return (
    <Suspense fallback={null}>
      <ResourcePerformanceSettingsPanel {...props} />
    </Suspense>
  );
}

export const resourcePerformancePlugin: BoardPlugin = {
  id: 'resource-performance',
  version: '1.0.0',
  titleKey: 'resourcePerformance.title',
  translations: {
    'zh-CN': {
      resourcePerformance: {
        title: '智能资源调用',
        settings: {
          title: '智能资源调用',
          enabled: '开启智能资源调用',
          enabledHint: '资源节点较多时，未使用的预览会延迟加载，网页和重型内容会按需激活。',
          threshold: '资源窗口阈值',
          windows: '个窗口',
          help: '开启后，当画板资源节点达到阈值，只有当前选中、鼠标进入或正在编辑的节点会加载文件内容、语法高亮、媒体和网页 iframe；其他节点保留轻量引用。离开节点后，网页 iframe 和大段内容会释放。它不会阻止用户访问资源，只会延迟未使用资源的加载。',
        },
      },
    },
    en: {
      resourcePerformance: {
        title: 'Smart resource loading',
        settings: {
          title: 'Smart resource loading',
          enabled: 'Enable smart resource loading',
          enabledHint: 'When many resource nodes exist, unused previews are deferred and heavy content activates on demand.',
          threshold: 'Resource window threshold',
          windows: 'windows',
          help: 'When enabled and the board reaches the threshold, only selected, hovered, or editing nodes load file content, syntax highlighting, media, and web iframes. Other nodes remain lightweight references. It does not block access; it only defers unused resource loading.',
        },
      },
    },
  },
  settings: [{
    id: 'preferences',
    titleKey: 'resourcePerformance.settings.title',
    Settings: LazySettings,
  }],
};
