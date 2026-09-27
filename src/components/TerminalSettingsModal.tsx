import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  TERMINAL_FONTS,
  TERMINAL_THEMES,
  resolveTerminalAppearance,
  useTerminalAppearance,
  type TerminalCursorStyle,
} from '@bohemian/terminal-ui/appearance';

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
  const appearance = useTerminalAppearance();
  const resolved = resolveTerminalAppearance(appearance);
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
      className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/70 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(event) => event.stopPropagation()}
        className="flex max-h-[84vh] w-full max-w-lg flex-col border border-zinc-700 bg-black"
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
          <div className="pixel-font text-[8px] text-zinc-100">{t('settings.title')}</div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-2 py-1 text-[13px] text-zinc-400 hover:text-white"
            title={t('add.close')}
          >
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          <div
            className="border border-zinc-800 px-3 py-3"
            style={{
              background: resolved.theme.background,
              color: resolved.theme.foreground,
              fontFamily: resolved.fontFamily,
              fontSize: appearance.fontSize,
              lineHeight: appearance.lineHeight,
            }}
          >
            <div style={{ opacity: 0.55 }}>{t('settings.previewHint')}</div>
            {['pi --session …', 'claude --resume …', 'codex resume …'].map((command) => (
              <div key={command}>
                <span style={{ color: resolved.theme.green }}>$</span> {command}
              </div>
            ))}
          </div>

          <Section title={t('settings.theme')}>
            <div className="flex flex-wrap gap-1">
              {TERMINAL_THEMES.map((theme) => (
                <Chip
                  key={theme.id}
                  active={appearance.themeId === theme.id}
                  onClick={() => appearance.setTheme(theme.id)}
                >
                  {theme.label}
                </Chip>
              ))}
            </div>
          </Section>

          <Section title={t('settings.colors')}>
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
          </Section>

          <Section title={t('settings.font')}>
            <div className="flex flex-wrap gap-1">
              {TERMINAL_FONTS.map((font) => (
                <Chip key={font.id} active={appearance.fontId === font.id} onClick={() => appearance.setFont(font.id)}>
                  {font.label}
                </Chip>
              ))}
            </div>
            <SliderRow
              label={t('settings.fontSize')}
              value={`${appearance.fontSize}px`}
              min={10}
              max={28}
              step={1}
              current={appearance.fontSize}
              onChange={appearance.setFontSize}
            />
            <SliderRow
              label={t('settings.lineHeight')}
              value={appearance.lineHeight.toFixed(2)}
              min={1}
              max={1}
              step={0.05}
              current={appearance.lineHeight}
              onChange={appearance.setLineHeight}
            />
          </Section>

          <Section title={t('settings.cursor')}>
            <div className="flex flex-wrap gap-1">
              {CURSORS.map((item) => (
                <Chip
                  key={item.id}
                  active={appearance.cursorStyle === item.id}
                  onClick={() => appearance.setCursorStyle(item.id)}
                >
                  {t(item.labelKey)}
                </Chip>
              ))}
            </div>
            <label className="mt-2 flex items-center justify-between text-[13px] text-zinc-300">
              <span>{t('settings.cursorBlink')}</span>
              <input
                type="checkbox"
                checked={appearance.cursorBlink}
                onChange={(event) => appearance.setCursorBlink(event.target.checked)}
                className="h-4 w-4 accent-zinc-100"
              />
            </label>
          </Section>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-zinc-800 px-3 py-2">
          <button
            type="button"
            onClick={() => appearance.reset()}
            className="px-btn px-btn-dark box-shadow-margin h-8 px-3 pixel-font text-[8px]"
          >
            {t('settings.reset')}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-btn px-btn-primary box-shadow-margin h-8 px-3 pixel-font text-[8px]"
          >
            {t('settings.done')}
          </button>
        </div>
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="text-[10px] uppercase tracking-wide text-zinc-500">{title}</div>
      {children}
    </section>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-2 py-1 text-[12px] ${
        active ? 'border-zinc-200 bg-zinc-100 text-black' : 'border-zinc-800 text-zinc-300 hover:border-zinc-500'
      }`}
    >
      {children}
    </button>
  );
}

function ColorRow({
  label,
  value,
  custom,
  onChange,
  onReset,
  resetLabel,
}: {
  label: string;
  value: string;
  custom: boolean;
  onChange: (value: string) => void;
  onReset: () => void;
  resetLabel: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-24 shrink-0 text-[13px] text-zinc-300">{label}</span>
      <input
        type="color"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-10 cursor-pointer border border-zinc-700 bg-black p-0"
      />
      <span className="flex-1 font-mono text-[12px] text-zinc-500">{value}</span>
      {custom ? (
        <button type="button" onClick={onReset} className="text-[11px] text-zinc-400 hover:text-white">
          {resetLabel}
        </button>
      ) : null}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  current,
  onChange,
}: {
  label: string;
  value: string;
  min: number;
  max: number;
  step: number;
  current: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-[13px] text-zinc-300">
      <span className="w-24 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={current}
        onChange={(event) => onChange(Number(event.target.value))}
        className="min-w-0 flex-1 accent-zinc-100"
      />
      <span className="w-12 text-right font-mono text-[12px] text-zinc-400">{value}</span>
    </label>
  );
}
