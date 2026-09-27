import type { ITheme, IUnicodeVersionProvider, Terminal } from '@xterm/xterm';

const UNICODE11_VERSION = '11';
const ORCA_UNICODE_VERSION = 'orca-11-zwj';
const ZERO_WIDTH_JOINER = 0x200d;

type UnicodeTerminal = Terminal & {
  _core?: {
    unicodeService?: {
      _providers?: Record<string, IUnicodeVersionProvider>;
    };
  };
};

function widthOf(properties: number): 0 | 1 | 2 {
  return ((properties >> 1) & 3) as 0 | 1 | 2;
}

function kindOf(properties: number): number {
  return properties >> 3;
}

function propertiesOf(kind: number, width: 0 | 1 | 2, join: boolean): number {
  return ((kind & 0xffffff) << 3) | ((width & 3) << 1) | (join ? 1 : 0);
}

class OrcaUnicodeProvider implements IUnicodeVersionProvider {
  readonly version = ORCA_UNICODE_VERSION;

  constructor(private readonly base: IUnicodeVersionProvider) {}

  wcwidth(codepoint: number): 0 | 1 | 2 {
    return this.base.wcwidth(codepoint);
  }

  charProperties(codepoint: number, preceding: number): number {
    const precedingWidth = widthOf(preceding);
    if (codepoint === ZERO_WIDTH_JOINER && precedingWidth > 0) {
      return propertiesOf(ZERO_WIDTH_JOINER, precedingWidth, true);
    }
    if (kindOf(preceding) === ZERO_WIDTH_JOINER && precedingWidth > 0 && this.wcwidth(codepoint) > 0) {
      return propertiesOf(codepoint, precedingWidth, true);
    }
    return this.base.charProperties(codepoint, preceding);
  }
}

/** Match Orca: Unicode 11 widths, with ZWJ emoji occupying one wide cell. */
export function activateTerminalUnicode(terminal: Terminal): void {
  const target = terminal as UnicodeTerminal;
  if (target.unicode.activeVersion === ORCA_UNICODE_VERSION) return;
  const base = target._core?.unicodeService?._providers?.[UNICODE11_VERSION];
  if (!base) {
    target.unicode.activeVersion = UNICODE11_VERSION;
    return;
  }
  if (!target.unicode.versions.includes(ORCA_UNICODE_VERSION)) {
    target.unicode.register(new OrcaUnicodeProvider(base));
  }
  target.unicode.activeVersion = ORCA_UNICODE_VERSION;
}

/** Orca raises the xterm-owned slider above its nearly invisible default. */
export function withTerminalScrollbarTheme(theme: ITheme): ITheme {
  return {
    overviewRulerBorder: 'transparent',
    scrollbarSliderBackground: 'rgba(180, 180, 185, 0.4)',
    scrollbarSliderHoverBackground: 'rgba(180, 180, 185, 0.6)',
    scrollbarSliderActiveBackground: 'rgba(180, 180, 185, 0.8)',
    ...theme,
  };
}
