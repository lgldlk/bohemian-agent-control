import type { ITerminalOptions, ITheme } from '@xterm/xterm';

/** Orca's desktop terminal grid. Scrollback is rows, not a CSS scrollbar. */
export const TERMINAL_SCROLLBACK_ROWS = 5_000;
export const TERMINAL_SCROLL_SENSITIVITY = 1.15;
export const TERMINAL_FAST_SCROLL_SENSITIVITY = 5;

export function terminalMinimumContrast(background: string | undefined): number {
  if (!background) return 1;
  const hex = background.trim().replace('#', '');
  if (hex.length !== 6) return 1;
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
  return luminance > 0.6 ? 4.5 : 1;
}

export function buildTerminalOptions(input: {
  cursorBlink: boolean;
  cursorStyle: NonNullable<ITerminalOptions['cursorStyle']>;
  fontFamily: string;
  fontSize: number;
  theme: ITheme;
}): ITerminalOptions {
  return {
    allowProposedApi: true,
    cursorBlink: input.cursorBlink,
    cursorStyle: input.cursorStyle,
    cursorInactiveStyle: input.cursorStyle === 'block' ? 'outline' : input.cursorStyle,
    fontFamily: input.fontFamily,
    fontSize: input.fontSize,
    fontWeight: '300',
    fontWeightBold: '500',
    lineHeight: 1,
    letterSpacing: 0,
    scrollback: TERMINAL_SCROLLBACK_ROWS,
    scrollSensitivity: TERMINAL_SCROLL_SENSITIVITY,
    fastScrollSensitivity: TERMINAL_FAST_SCROLL_SENSITIVITY,
    allowTransparency: false,
    minimumContrastRatio: terminalMinimumContrast(input.theme.background),
    macOptionIsMeta: false,
    macOptionClickForcesSelection: true,
    drawBoldTextInBrightColors: true,
    rightClickSelectsWord: true,
    theme: input.theme,
    scrollbar: { width: 7 },
    vtExtensions: { kittyKeyboard: true },
  };
}
