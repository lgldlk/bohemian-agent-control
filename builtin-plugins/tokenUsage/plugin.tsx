import { lazy, Suspense } from 'react';
import type { BoardPlugin, BoardPluginPageProps } from '@/plugin-system';

const LazyTokenUsageDashboard = lazy(() => import('./TokenUsageDashboard').then(({ TokenUsageDashboard }) => ({ default: TokenUsageDashboard })));

function TokenUsagePage(props: BoardPluginPageProps) {
  return (
    <Suspense fallback={<div className="flex h-full items-center justify-center bg-[#0a0a0d] pixel-font text-[9px] text-zinc-500">LOADING USAGE...</div>}>
      <LazyTokenUsageDashboard {...props} />
    </Suspense>
  );
}

export const tokenUsagePlugin: BoardPlugin = {
  id: 'token-usage',
  version: '1.0.0',
  titleKey: 'usage.title',
  pages: [{
    id: 'dashboard',
    labelKey: 'usage.tab',
    Page: TokenUsagePage,
  }],
};
