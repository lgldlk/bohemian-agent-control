import { create } from 'zustand';
import type { ITheme } from '@xterm/xterm';

export type TerminalFontId = 'jetbrains' | 'sfmono' | 'vt323';
export type TerminalThemeId = 'bohemian' | 'paper' | 'phosphor';
export type TerminalCursorStyle = 'bar' | 'block' | 'underline';

export interface TerminalFontOption {
  id: TerminalFontId;
  label: string;
  family: string;
}

export interface TerminalThemeOption {
  id: TerminalThemeId;
  label: string;
  theme: ITheme;
}

export const TERMINAL_FONTS: TerminalFontOption[] = [
  {
    id: 'jetbrains',
    label: 'JetBrains Mono',
    family: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
  },
  {
    id: 'sfmono',
    label: 'SF Mono',
    family: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
  },
  {
    id: 'vt323',
    label: 'VT323',
    family: '"VT323", ui-monospace, monospace',
  },
];

export const TERMINAL_THEMES: TerminalThemeOption[] = [
  {
    id: 'bohemian',
    label: 'Bohemian',
    theme: {
      background: '#101014',
      foreground: '#f3efe6',
      cursor: '#f0c36a',
      cursorAccent: '#101014',
      selectionBackground: '#3c4d63',
      selectionForeground: '#f3efe6',
      black: '#1c1c22',
      red: '#ff6f6f',
      green: '#85d6a4',
      yellow: '#f0c36a',
      blue: '#8bb7ff',
      magenta: '#d7a8ff',
      cyan: '#7ee0d4',
      white: '#f3efe6',
      brightBlack: '#b4aea3',
      brightRed: '#ff8d8d',
      brightGreen: '#a6e6be',
      brightYellow: '#f6d78a',
      brightBlue: '#adc9ff',
      brightMagenta: '#e4c2ff',
      brightCyan: '#9aeee4',
      brightWhite: '#fffaf1',
    },
  },
  {
    id: 'paper',
    label: 'Paper',
    theme: {
      background: '#f6f1e8',
      foreground: '#1c1915',
      cursor: '#8a5a12',
      cursorAccent: '#f6f1e8',
      selectionBackground: '#d9c9a8',
      selectionForeground: '#1c1915',
      black: '#2a2723',
      red: '#b42318',
      green: '#176b45',
      yellow: '#8a5a12',
      blue: '#1d4f91',
      magenta: '#6d3d86',
      cyan: '#156a6a',
      white: '#f6f1e8',
      brightBlack: '#5c564d',
      brightRed: '#d63c2e',
      brightGreen: '#1f8a58',
      brightYellow: '#a56b16',
      brightBlue: '#2a6fbe',
      brightMagenta: '#8a4ea8',
      brightCyan: '#1b8888',
      brightWhite: '#1c1915',
    },
  },
  {
    id: 'phosphor',
    label: 'Phosphor',
    theme: {
      background: '#03150c',
      foreground: '#b6f5c8',
      cursor: '#7cff9c',
      cursorAccent: '#03150c',
      selectionBackground: '#14532d',
      selectionForeground: '#ecfdf3',
      black: '#03150c',
      red: '#f87171',
      green: '#4ade80',
      yellow: '#d9f99d',
      blue: '#86efac',
      magenta: '#bbf7d0',
      cyan: '#6ee7b7',
      white: '#dcfce7',
      brightBlack: '#86efac',
      brightRed: '#fca5a5',
      brightGreen: '#86efac',
      brightYellow: '#ecfccb',
      brightBlue: '#bbf7d0',
      brightMagenta: '#dcfce7',
      brightCyan: '#a7f3d0',
      brightWhite: '#f0fdf4',
    },
  },
];

export interface TerminalAppearance {
  fontId: TerminalFontId;
  themeId: TerminalThemeId;
  fontSize: number;
  lineHeight: number;
  background: string | null;
  foreground: string | null;
  cursor: string | null;
  cursorStyle: TerminalCursorStyle;
  cursorBlink: boolean;
}

export const DEFAULT_TERMINAL_APPEARANCE: TerminalAppearance = {
  fontId: 'jetbrains',
  themeId: 'bohemian',
  fontSize: 15,
  lineHeight: 1,
  background: null,
  foreground: null,
  cursor: null,
  cursorStyle: 'bar',
  cursorBlink: true,
};

const STORAGE_KEY = 'bohemian-agent-control:terminal-appearance:v1';

function appearanceOf(state: TerminalAppearance): TerminalAppearance {
  return {
    fontId: state.fontId,
    themeId: state.themeId,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    background: state.background,
    foreground: state.foreground,
    cursor: state.cursor,
    cursorStyle: state.cursorStyle,
    cursorBlink: state.cursorBlink,
  };
}

function loadAppearance(): TerminalAppearance {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '') as Partial<TerminalAppearance>;
    return {
      fontId: TERMINAL_FONTS.some((font) => font.id === parsed.fontId) ? parsed.fontId as TerminalFontId : DEFAULT_TERMINAL_APPEARANCE.fontId,
      themeId: TERMINAL_THEMES.some((theme) => theme.id === parsed.themeId) ? parsed.themeId as TerminalThemeId : DEFAULT_TERMINAL_APPEARANCE.themeId,
      fontSize: clampFontSize(parsed.fontSize),
      lineHeight: clampLineHeight(parsed.lineHeight),
      background: parseHex(parsed.background),
      foreground: parseHex(parsed.foreground),
      cursor: parseHex(parsed.cursor),
      cursorStyle: parsed.cursorStyle === 'block' || parsed.cursorStyle === 'underline' ? parsed.cursorStyle : 'bar',
      cursorBlink: parsed.cursorBlink !== false,
    };
  } catch {
    return DEFAULT_TERMINAL_APPEARANCE;
  }
}

function clampFontSize(value: unknown): number {
  const size = typeof value === 'number' ? value : DEFAULT_TERMINAL_APPEARANCE.fontSize;
  return Math.min(28, Math.max(10, Math.round(size)));
}

function clampLineHeight(value: unknown): number {
  const height = typeof value === 'number' ? value : DEFAULT_TERMINAL_APPEARANCE.lineHeight;
  return Math.min(1, Math.max(1, Math.round(height * 20) / 20));
}

function parseHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null;
}

export function resolveTerminalAppearance(appearance: TerminalAppearance) {
  const font = TERMINAL_FONTS.find((item) => item.id === appearance.fontId) ?? TERMINAL_FONTS[0];
  const preset = TERMINAL_THEMES.find((item) => item.id === appearance.themeId) ?? TERMINAL_THEMES[0];
  const background = appearance.background ?? preset.theme.background;
  const foreground = appearance.foreground ?? preset.theme.foreground;
  return {
    ...appearance,
    fontFamily: font.family,
    fontLabel: font.label,
    theme: {
      ...preset.theme,
      background,
      foreground,
      cursor: appearance.cursor ?? preset.theme.cursor,
      cursorAccent: background,
      selectionForeground: foreground,
    },
    themeLabel: preset.label,
  };
}

interface TerminalAppearanceState extends TerminalAppearance {
  setFont: (fontId: TerminalFontId) => void;
  setTheme: (themeId: TerminalThemeId) => void;
  setFontSize: (fontSize: number) => void;
  setLineHeight: (lineHeight: number) => void;
  setBackground: (background: string | null) => void;
  setForeground: (foreground: string | null) => void;
  setCursor: (cursor: string | null) => void;
  setCursorStyle: (cursorStyle: TerminalCursorStyle) => void;
  setCursorBlink: (cursorBlink: boolean) => void;
  reset: () => void;
}

export const useTerminalAppearance = create<TerminalAppearanceState>()((set, get) => ({
  ...loadAppearance(),
  setFont: (fontId) => {
    const current = appearanceOf(get());
    const fontSize = fontId === 'vt323' && current.fontSize < 17 ? 18 : current.fontSize;
    save(set, { ...current, fontId, fontSize });
  },
  setTheme: (themeId) => save(set, { ...appearanceOf(get()), themeId, background: null, foreground: null, cursor: null }),
  setFontSize: (fontSize) => save(set, { ...appearanceOf(get()), fontSize: clampFontSize(fontSize) }),
  setLineHeight: (lineHeight) => save(set, { ...appearanceOf(get()), lineHeight: clampLineHeight(lineHeight) }),
  setBackground: (background) => save(set, { ...appearanceOf(get()), background: parseHex(background) }),
  setForeground: (foreground) => save(set, { ...appearanceOf(get()), foreground: parseHex(foreground) }),
  setCursor: (cursor) => save(set, { ...appearanceOf(get()), cursor: parseHex(cursor) }),
  setCursorStyle: (cursorStyle) => save(set, { ...appearanceOf(get()), cursorStyle }),
  setCursorBlink: (cursorBlink) => save(set, { ...appearanceOf(get()), cursorBlink }),
  reset: () => save(set, DEFAULT_TERMINAL_APPEARANCE),
}));

function save(
  set: (partial: Partial<TerminalAppearance>) => void,
  next: TerminalAppearance,
) {
  set(next);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
