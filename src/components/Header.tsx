import { PixelButton } from '@/components/pixel/PixelButton';
import { PixelInput } from '@/components/pixel/PixelInput';
import { PixelBadge } from '@/components/pixel/PixelBadge';
import { PixelLogo } from '@/components/pixel/PixelLogo';
import { RefreshCw, LayoutGrid, Grid3x3, Search, Gamepad2 } from 'lucide-react';

interface HeaderProps {
  view: 'grid' | 'treemap';
  onViewChange: (view: 'grid' | 'treemap') => void;
  taskCount: number;
  lastUpdate: Date | null;
  onRefresh: () => void;
  search: string;
  onSearch: (v: string) => void;
}

export default function Header({
  view,
  onViewChange,
  taskCount,
  lastUpdate,
  onRefresh,
  search,
  onSearch,
}: HeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[#0a0a0d]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 sm:px-6">
        {/* Logo:像素块保留,标题用更易读的字号 */}
        <div className="flex items-center gap-3">
          <div className="px-card flex h-10 w-10 items-center justify-center bg-zinc-100">
            <Gamepad2 className="h-5 w-5 text-black" />
          </div>
          <div>
            <PixelLogo />
            <p className="mt-1 text-xs text-zinc-500">
              {taskCount} 个会话
              {lastUpdate && <span> · {lastUpdate.toLocaleTimeString('zh-CN')}</span>}
            </p>
          </div>
        </div>

        {/* 搜索 */}
        <div className="relative ml-2 hidden min-w-[200px] flex-1 sm:block md:max-w-sm">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <PixelInput
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="搜索任务、项目、模型…"
            className="w-full py-2 pl-10 pr-3 text-sm"
          />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <PixelButton variant="dark" size="sm" onClick={onRefresh} title="刷新">
            <RefreshCw className="h-3.5 w-3.5" />
            REFRESH
          </PixelButton>
          <div className="flex gap-2">
            <PixelButton
              variant={view === 'grid' ? 'primary' : 'dark'}
              size="sm"
              onClick={() => onViewChange('grid')}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              CARDS
            </PixelButton>
            <PixelButton
              variant={view === 'treemap' ? 'primary' : 'dark'}
              size="sm"
              onClick={() => onViewChange('treemap')}
            >
              <Grid3x3 className="h-3.5 w-3.5" />
              MAP
            </PixelButton>
          </div>
        </div>
      </div>

      {/* 移动端搜索 */}
      <div className="px-4 pb-3 sm:hidden">
        <PixelInput
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="搜索任务、项目、模型…"
          className="w-full py-2 text-sm"
        />
      </div>
    </header>
  );
}

export { PixelBadge };
