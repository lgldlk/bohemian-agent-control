import { lazy, Suspense, useState } from 'react';
import { Search, Settings, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '@/i18n';
import { PixelLogo } from '@/components/pixel/PixelLogo';
import type { View } from '@/hooks/useAppState';

const TerminalSettingsModal = lazy(() => import('@/components/TerminalSettingsModal'));

interface BoardHeaderProps {
  taskCount: number;
  spaceCount: number;
  lastUpdate: Date | null;
  onRefresh: () => void;
  view: View;
  onViewChange: (v: View) => void;
  search: string;
  onSearch: (v: string) => void;
  onNewTerminal: () => void;
}

export default function BoardHeader(props: BoardHeaderProps) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <header className="z-30 shrink-0 border-b border-zinc-800 bg-[#0a0a0d]/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <div>
          <PixelLogo />
          <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
            {t('app.sessions', { count: props.taskCount })} · {t('app.boardCount', { count: props.spaceCount })}
            {props.lastUpdate && (
              <span> · {props.lastUpdate.toLocaleTimeString(zh ? 'zh-CN' : 'en-US')}</span>
            )}
          </p>
        </div>

        {/* 视图:白板 / 卡片 */}
        <div className="flex gap-3">
          <ViewButton active={props.view === 'board'} onClick={() => props.onViewChange('board')}>
            BOARD
          </ViewButton>
          <ViewButton active={props.view === 'grid'} onClick={() => props.onViewChange('grid')}>
            CARDS
          </ViewButton>
        </div>
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          title={t('settings.title')}
          className="px-btn px-btn-dark box-shadow-margin flex h-8 items-center gap-1 px-3 pixel-font text-[8px]"
        >
          <Settings className="h-3 w-3" />
          SET
        </button>

        <div className="relative ml-auto hidden min-w-[180px] flex-1 sm:block md:max-w-xs">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-600" />
          <input
            value={props.search}
            onChange={(e) => props.onSearch(e.target.value)}
            placeholder={t('app.searchPlaceholder')}
            className="px-input box-shadow-margin w-full py-1.5 pl-9 pr-8 text-sm"
          />
          {props.search && (
            <button
              type="button"
              onClick={() => props.onSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-zinc-600 hover:text-zinc-100"
              aria-label={t('app.clearSearch')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={props.onNewTerminal}
          title={t('app.newTerminal')}
          className="px-btn px-btn-dark box-shadow-margin h-8 px-3 pixel-font text-[8px]"
        >
          TERM
        </button>
        <button
          type="button"
          onClick={props.onRefresh}
          title={t('app.sync')}
          className="px-btn px-btn-dark box-shadow-margin h-8 px-3 pixel-font text-[8px]"
        >
          SYNC
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setAppLanguage('zh-CN')}
            className={`px-btn box-shadow-margin h-8 px-2 pixel-font text-[8px] ${
              zh ? 'px-btn-primary' : 'px-btn-dark'
            }`}
          >
            {t('app.langZh')}
          </button>
          <button
            type="button"
            onClick={() => setAppLanguage('en')}
            className={`px-btn box-shadow-margin h-8 px-2 pixel-font text-[8px] ${
              zh ? 'px-btn-dark' : 'px-btn-primary'
            }`}
          >
            {t('app.langEn')}
          </button>
        </div>
      </div>
      {settingsOpen ? (
        <Suspense fallback={null}>
          <TerminalSettingsModal open onClose={() => setSettingsOpen(false)} />
        </Suspense>
      ) : null}
    </header>
  );
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-btn box-shadow-margin h-8 px-3 pixel-font text-[8px] ${
        active ? 'px-btn-primary' : 'px-btn-dark'
      }`}
    >
      {children}
    </button>
  );
}
