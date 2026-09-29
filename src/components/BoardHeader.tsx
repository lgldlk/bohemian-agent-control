import { lazy, Suspense, useState } from 'react';
import { Languages, Search, Settings, SquareTerminal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setAppLanguage } from '@/i18n';
import { PixelLogo } from '@/components/pixel/PixelLogo';
import {
  BoardPluginPageButtons,
  BoardPluginTopbarButtons,
} from '@/board/plugins/hosts/BoardPluginTopbarHost';
import { closeBoardPluginPage, useActiveBoardPluginPageId } from '@/board/plugins/pluginStore';
import type { View } from '@/hooks/useAppState';

const TerminalSettingsModal = lazy(() => import('@/components/TerminalSettingsModal'));

interface BoardHeaderProps {
  taskCount: number;
  spaceCount: number;
  view: View;
  onViewChange: (v: View) => void;
  search: string;
  onSearch: (v: string) => void;
  onAddTerminal: () => void;
}

export default function BoardHeader(props: BoardHeaderProps) {
  const { t, i18n } = useTranslation();
  const zh = i18n.language.startsWith('zh');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const activePluginPageId = useActiveBoardPluginPageId();

  return (
    <header className="z-30 shrink-0 border-b border-zinc-800 bg-[#0a0a0d]/95 backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
        <div>
          <PixelLogo />
          <p className="mt-0.5 text-xs tabular-nums text-zinc-500">
            {t('app.sessions', { count: props.taskCount })} · {t('app.boardCount', { count: props.spaceCount })}
          </p>
        </div>

        {/* 视图:白板 / 卡片 */}
        <div className="flex gap-3">
          <ViewButton active={props.view === 'board' && !activePluginPageId} onClick={() => { closeBoardPluginPage(); props.onViewChange('board'); }}>
            BOARD
          </ViewButton>
          <ViewButton active={props.view === 'grid' && !activePluginPageId} onClick={() => { closeBoardPluginPage(); props.onViewChange('grid'); }}>
            CARDS
          </ViewButton>
          <BoardPluginPageButtons onActivatePage={() => props.onViewChange('board')} />
        </div>
        <BoardPluginTopbarButtons />
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
          onClick={() => { closeBoardPluginPage(); props.onAddTerminal(); }}
          title={t('app.addTerminal')}
          aria-label={t('app.addTerminal')}
          className="px-btn px-btn-dark box-shadow-margin flex h-8 items-center gap-1 px-3 pixel-font text-[8px]"
        >
          <SquareTerminal className="h-3 w-3" />
          + TERM
        </button>
        <button
          type="button"
          onClick={() => setAppLanguage(zh ? 'en' : 'zh-CN')}
          title={zh ? t('app.switchToEnglish') : t('app.switchToChinese')}
          aria-label={zh ? t('app.switchToEnglish') : t('app.switchToChinese')}
          className="px-btn px-btn-dark box-shadow-margin flex h-8 items-center gap-1 px-2 pixel-font text-[8px]"
        >
          <Languages className="h-3 w-3" />
          {zh ? t('app.langZh') : t('app.langEn')}
        </button>
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
