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
          help: '开启后，阈值以内的资源全部保活。超过阈值时，当前可读视口内的资源仍全部加载；屏幕外或缩小到不可读的资源按距离保留最近的阈值名额，只断开超出的部分。资源进入可读视口或放大后会自动恢复。',
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
          help: 'When enabled, all resources stay alive below the threshold. Above it, every resource readable in the viewport remains loaded. Offscreen or unreadably small resources keep the nearest threshold slots, and only the excess is disconnected. Resources restore automatically when they enter a readable viewport.',
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
