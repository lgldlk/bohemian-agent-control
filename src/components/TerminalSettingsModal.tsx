import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import {
  LayoutGrid,
  Plug,
  RotateCcw,
  SquareTerminal,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  TERMINAL_FONTS,
  TERMINAL_THEMES,
  resolveTerminalAppearance,
  useTerminalAppearance,
  type TerminalCursorStyle,
  type TerminalAppearance,
  type TerminalFontId,
  type TerminalThemeId,
} from '@bohemian/terminal-ui/appearance';
import {
  DEFAULT_AGENTS_PER_ROW,
  MAX_AGENTS_PER_ROW,
  MIN_AGENTS_PER_ROW,
  useBoardLayoutStore,
} from '@/board/boardLayoutStore';
import { BoardPluginSettingsHost } from '@/board/plugins/hosts/BoardPluginSettingsHost';
import { UserPluginManager } from './UserPluginManager';
import { ChoiceChip, ColorRow, SettingSwitch, SettingsPanel, SliderRow } from './settings/SettingControls';

type SettingsSectionId = 'terminal' | 'board' | 'plugins';

interface SettingsSectionDefinition {
  id: SettingsSectionId;
  labelKey: string;
  descriptionKey: string;
  icon: LucideIcon;
}

interface TerminalAppearanceControls extends TerminalAppearance {
  setFont: (fontId: TerminalFontId) => void;
  setTheme: (themeId: TerminalThemeId) => void;
  setFontSize: (fontSize: number) => void;
  setBackground: (background: string | null) => void;
  setForeground: (foreground: string | null) => void;
  setCursor: (cursor: string | null) => void;
  setCursorStyle: (cursorStyle: TerminalCursorStyle) => void;
  setCursorBlink: (cursorBlink: boolean) => void;
}

const SETTINGS_SECTIONS: readonly SettingsSectionDefinition[] = [
  {
    id: 'terminal',
    labelKey: 'settings.navigation.terminal',
    descriptionKey: 'settings.navigation.terminalHint',
    icon: SquareTerminal,
  },
  {
    id: 'board',
    labelKey: 'settings.navigation.board',
    descriptionKey: 'settings.navigation.boardHint',
    icon: LayoutGrid,
  },
  {
    id: 'plugins',
    labelKey: 'settings.navigation.plugins',
    descriptionKey: 'settings.navigation.pluginsHint',
    icon: Plug,
  },
];

const CURSORS: { id: TerminalCursorStyle; labelKey: string }[] = [
  { id: 'bar', labelKey: 'settings.cursorBar' },
  { id: 'block', labelKey: 'settings.cursorBlock' },
  { id: 'underline', labelKey: 'settings.cursorUnderline' },
];

export default function TerminalSettingsModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>('terminal');
  const appearance = useTerminalAppearance();
  const resolved = resolveTerminalAppearance(appearance);
  const agentsPerRow = useBoardLayoutStore((state) => state.agentsPerRow);
  const setAgentsPerRow = useBoardLayoutStore((state) => state.setAgentsPerRow);
  const activeDefinition = SETTINGS_SECTIONS.find((section) => section.id === activeSection) ?? SETTINGS_SECTIONS[0];

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open || typeof document === 'undefined') return null;

  const resetActiveSection = () => {
    if (activeSection === 'terminal') appearance.reset();
    if (activeSection === 'board') setAgentsPerRow(DEFAULT_AGENTS_PER_ROW);
  };

  return createPortal(
    <motion.div
      initial={reduceMotion ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: reduceMotion ? 0 : 0.16 }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/80 p-2 backdrop-blur-[2px] sm:p-4"
    >
      <motion.div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-section-title"
        tabIndex={-1}
        initial={reduceMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.2, 0.8, 0.2, 1] }}
        className="grid h-[min(780px,calc(100dvh-16px))] w-full max-w-5xl grid-cols-1 overflow-hidden rounded-[12px] border border-zinc-700 bg-[#0a0a0d] shadow-[0_28px_100px_rgba(0,0,0,0.72)] outline-none md:h-[min(780px,calc(100dvh-32px))] md:grid-cols-[224px_minmax(0,1fr)]"
      >
        <aside className="hidden min-h-0 flex-col border-r border-zinc-800 bg-[#0d0d11] md:flex">
          <div className="border-b border-zinc-800 px-5 py-5">
            <div className="pixel-font text-[9px] text-zinc-100">
              {t('settings.title').toUpperCase()}
            </div>
            <p className="mt-2 text-[11px] leading-5 text-zinc-500">{t('settings.controlCenterHint')}</p>
          </div>
          <nav className="flex-1 space-y-1 p-3" aria-label={t('settings.title')}>
            {SETTINGS_SECTIONS.map((section) => (
              <SettingsNavButton
                key={section.id}
                section={section}
                active={activeSection === section.id}
                onClick={() => setActiveSection(section.id)}
              />
            ))}
          </nav>
          <div className="border-t border-zinc-800 px-4 py-4 font-mono text-[9px] leading-4 text-zinc-600">
            {t('settings.autoSaveHint')}
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-col">
          <header className="flex min-h-16 shrink-0 items-center gap-3 border-b border-zinc-800 px-4 py-3 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 md:hidden">
                <span className="pixel-font text-[8px] text-zinc-100">
                  {t('settings.title').toUpperCase()}
                </span>
                <span className="text-zinc-700">/</span>
              </div>
              <h2 id="settings-section-title" className="mt-1 text-[15px] font-medium text-zinc-100 md:mt-0">
                {t(activeDefinition.labelKey)}
              </h2>
              <p className="mt-0.5 hidden text-[11px] leading-4 text-zinc-500 sm:block">
                {t(activeDefinition.descriptionKey)}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="grid h-8 w-8 shrink-0 place-items-center border border-zinc-800 text-zinc-500 transition-colors hover:border-zinc-600 hover:bg-zinc-900 hover:text-white active:translate-y-px"
              title={t('add.close')}
              aria-label={t('add.close')}
            >
              <X className="h-4 w-4" />
            </button>
          </header>

          <nav className="flex shrink-0 overflow-x-auto border-b border-zinc-800 bg-[#0d0d11] p-2 md:hidden" aria-label={t('settings.title')}>
            {SETTINGS_SECTIONS.map((section) => {
              const Icon = section.icon;
              const active = activeSection === section.id;
              return (
                <button
                  key={section.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveSection(section.id)}
                  className={`flex min-w-max items-center gap-2 border px-3 py-2 text-[11px] transition-colors active:translate-y-px ${
                    active
                      ? 'border-zinc-400 bg-zinc-100 text-zinc-950'
                      : 'border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {t(section.labelKey)}
                </button>
              );
            })}
          </nav>

          <main className="settings-scrollbar min-h-0 flex-1 overflow-y-auto p-3 sm:p-5">
            {activeSection === 'terminal' ? (
              <TerminalAppearanceSettings appearance={appearance} resolved={resolved} />
            ) : null}
            {activeSection === 'board' ? (
              <BoardLayoutSettings agentsPerRow={agentsPerRow} setAgentsPerRow={setAgentsPerRow} />
            ) : null}
            {activeSection === 'plugins' ? <PluginSettings /> : null}
          </main>

          <footer className="flex min-h-14 shrink-0 items-center gap-3 border-t border-zinc-800 bg-[#0d0d11] px-4 py-3 sm:px-5">
            <span className="hidden text-[10px] text-zinc-600 sm:block">{t('settings.autoSaveHint')}</span>
            <div className="ml-auto flex items-center gap-2">
              {activeSection !== 'plugins' ? (
                <button
                  type="button"
                  onClick={resetActiveSection}
                  className="flex h-8 items-center gap-2 border border-zinc-800 px-3 text-[10px] text-zinc-400 transition-colors hover:border-zinc-600 hover:text-zinc-100 active:translate-y-px"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  {t('settings.reset')}
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="px-btn px-btn-primary box-shadow-margin h-8 px-4 pixel-font text-[8px]"
              >
                {t('settings.done')}
              </button>
            </div>
          </footer>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function SettingsNavButton({
  section,
  active,
  onClick,
}: {
  section: SettingsSectionDefinition;
  active: boolean;
  onClick: () => void;
}) {
  const { t } = useTranslation();
  const Icon = section.icon;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`relative flex w-full items-start gap-3 border px-3 py-3 text-left transition-colors active:translate-y-px ${
        active
          ? 'border-zinc-700 bg-zinc-900 text-zinc-100'
          : 'border-transparent text-zinc-500 hover:border-zinc-800 hover:bg-zinc-950 hover:text-zinc-300'
      }`}
    >
      {active ? <span className="absolute bottom-2 left-0 top-2 w-0.5 bg-zinc-100" /> : null}
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium">{t(section.labelKey)}</span>
        <span className="mt-1 block text-[10px] leading-4 text-zinc-600">{t(section.descriptionKey)}</span>
      </span>
    </button>
  );
}

function TerminalAppearanceSettings({
  appearance,
  resolved,
}: {
  appearance: TerminalAppearanceControls;
  resolved: ReturnType<typeof resolveTerminalAppearance>;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SettingsPanel className="xl:col-span-2" title={t('settings.preview')} hint={t('settings.previewHint')}>
        <div
          className="relative min-h-36 overflow-hidden border border-white/10 p-4 shadow-inner"
          style={{
            background: resolved.theme.background,
            color: resolved.theme.foreground,
            fontFamily: resolved.fontFamily,
            fontSize: appearance.fontSize,
            lineHeight: appearance.lineHeight,
          }}
        >
          <div className="pointer-events-none absolute inset-0 opacity-[0.04] [background-image:linear-gradient(rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:100%_4px]" />
          <div className="relative space-y-1">
            <div style={{ opacity: 0.48 }}>bohemian-agent-control / workspace</div>
            {['pi --session …', 'claude --resume …', 'codex resume …'].map((command, index) => (
              <div key={command}>
                <span style={{ color: resolved.theme.green }}>$</span> {command}
                {index === 2 ? <span className="ml-1 inline-block h-[1em] w-[0.5em] align-[-0.12em]" style={{ background: resolved.theme.cursor }} /> : null}
              </div>
            ))}
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel title={t('settings.theme')} hint={t('settings.themeHint')}>
        <div className="flex flex-wrap gap-2">
          {TERMINAL_THEMES.map((theme) => (
            <ChoiceChip
              key={theme.id}
              active={appearance.themeId === theme.id}
              onClick={() => appearance.setTheme(theme.id)}
            >
              <span className="h-2.5 w-2.5 border border-white/15" style={{ background: theme.theme.background }} />
              {theme.label}
            </ChoiceChip>
          ))}
        </div>
      </SettingsPanel>

      <SettingsPanel title={t('settings.font')} hint={t('settings.fontHint')}>
        <div className="flex flex-wrap gap-2">
          {TERMINAL_FONTS.map((font) => (
            <ChoiceChip key={font.id} active={appearance.fontId === font.id} onClick={() => appearance.setFont(font.id)}>
              {font.label}
            </ChoiceChip>
          ))}
        </div>
        <div className="mt-4 space-y-3 border-t border-zinc-800 pt-4">
          <SliderRow
            label={t('settings.fontSize')}
            value={`${appearance.fontSize}px`}
            min={10}
            max={28}
            step={1}
            current={appearance.fontSize}
            onChange={appearance.setFontSize}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel title={t('settings.colors')} hint={t('settings.colorsHint')}>
        <div className="divide-y divide-zinc-800">
          <ColorRow
            label={t('settings.background')}
            value={resolved.theme.background ?? '#101014'}
            custom={Boolean(appearance.background)}
            onChange={appearance.setBackground}
            onReset={() => appearance.setBackground(null)}
            resetLabel={t('settings.useTheme')}
          />
          <ColorRow
            label={t('settings.foreground')}
            value={resolved.theme.foreground ?? '#f3efe6'}
            custom={Boolean(appearance.foreground)}
            onChange={appearance.setForeground}
            onReset={() => appearance.setForeground(null)}
            resetLabel={t('settings.useTheme')}
          />
          <ColorRow
            label={t('settings.cursorColor')}
            value={resolved.theme.cursor ?? '#f0c36a'}
            custom={Boolean(appearance.cursor)}
            onChange={appearance.setCursor}
            onReset={() => appearance.setCursor(null)}
            resetLabel={t('settings.useTheme')}
          />
        </div>
      </SettingsPanel>

      <SettingsPanel title={t('settings.cursor')} hint={t('settings.cursorHint')}>
        <div className="flex flex-wrap gap-2">
          {CURSORS.map((item) => (
            <ChoiceChip
              key={item.id}
              active={appearance.cursorStyle === item.id}
              onClick={() => appearance.setCursorStyle(item.id)}
            >
              {t(item.labelKey)}
            </ChoiceChip>
          ))}
        </div>
        <div className="mt-4 border-t border-zinc-800 pt-4">
          <SettingSwitch
            label={t('settings.cursorBlink')}
            hint={t('settings.cursorBlinkHint')}
            checked={appearance.cursorBlink}
            onChange={appearance.setCursorBlink}
          />
        </div>
      </SettingsPanel>
    </div>
  );
}

function BoardLayoutSettings({
  agentsPerRow,
  setAgentsPerRow,
}: {
  agentsPerRow: number;
  setAgentsPerRow: (value: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,.85fr)]">
      <SettingsPanel title={t('settings.agentsPerRow')} hint={t('settings.agentsPerRowHint')}>
        <div className="mt-2 flex items-center justify-between gap-4 border-y border-zinc-800 py-5">
          <div>
            <div className="font-mono text-4xl tabular-nums text-zinc-100">{agentsPerRow}</div>
            <div className="mt-1 text-[10px] uppercase tracking-[0.16em] text-zinc-600">{t('settings.columns')}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="grid h-10 w-10 place-items-center border border-zinc-700 text-lg text-zinc-200 hover:border-zinc-400 hover:bg-zinc-900 disabled:text-zinc-700 active:translate-y-px"
              onClick={() => setAgentsPerRow(agentsPerRow - 1)}
              disabled={agentsPerRow <= MIN_AGENTS_PER_ROW}
              aria-label={t('settings.agentsPerRowDecrease')}
            >
              −
            </button>
            <button
              type="button"
              className="grid h-10 w-10 place-items-center border border-zinc-700 text-lg text-zinc-200 hover:border-zinc-400 hover:bg-zinc-900 disabled:text-zinc-700 active:translate-y-px"
              onClick={() => setAgentsPerRow(agentsPerRow + 1)}
              disabled={agentsPerRow >= MAX_AGENTS_PER_ROW}
              aria-label={t('settings.agentsPerRowIncrease')}
            >
              +
            </button>
          </div>
        </div>
        <p className="mt-4 text-[11px] leading-5 text-zinc-500">{t('settings.boardSaveHint')}</p>
      </SettingsPanel>

      <SettingsPanel title={t('settings.layoutPreview')} hint={t('settings.layoutPreviewHint')}>
        <div className="overflow-hidden border border-zinc-800 bg-[#08080b] p-4">
          <div
            className="grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${agentsPerRow}, minmax(18px, 1fr))` }}
            aria-hidden="true"
          >
            {Array.from({ length: agentsPerRow }, (_, index) => (
              <div key={index} className="aspect-[4/3] min-h-8 border border-zinc-600 bg-zinc-800" />
            ))}
            <div className="aspect-[4/3] min-h-8 border border-dashed border-zinc-800 bg-zinc-950" />
          </div>
          <div className="mt-3 flex items-center gap-2 text-[9px] uppercase tracking-[0.14em] text-zinc-700">
            <span className="h-px flex-1 bg-zinc-900" />
            {t('settings.nextRow')}
            <span className="h-px flex-1 bg-zinc-900" />
          </div>
        </div>
      </SettingsPanel>
    </div>
  );
}

function PluginSettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-5">
      <UserPluginManager />
      <SettingsPanel title={t('settings.pluginPreferences')} hint={t('settings.pluginPreferencesHint')}>
        <BoardPluginSettingsHost />
      </SettingsPanel>
    </div>
  );
}
