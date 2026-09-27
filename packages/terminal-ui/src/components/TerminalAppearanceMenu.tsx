import { TERMINAL_FONTS, TERMINAL_THEMES, useTerminalAppearance } from '../appearance';

export function TerminalAppearanceMenu() {
  const appearance = useTerminalAppearance();
  return (
    <div className="w-52 space-y-3 p-2 text-left">
      <section>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Font</div>
        <div className="flex flex-col gap-1">
          {TERMINAL_FONTS.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => appearance.setFont(font.id)}
              className={`px-2 py-1 text-left text-xs ${appearance.fontId === font.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
            >
              {font.label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-zinc-500">Theme</div>
        <div className="flex flex-col gap-1">
          {TERMINAL_THEMES.map((theme) => (
            <button
              key={theme.id}
              type="button"
              onClick={() => appearance.setTheme(theme.id)}
              className={`px-2 py-1 text-left text-xs ${appearance.themeId === theme.id ? 'bg-zinc-800 text-white' : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'}`}
            >
              {theme.label}
            </button>
          ))}
        </div>
      </section>
      <section className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-wide text-zinc-500">Size</div>
        <div className="flex items-center gap-1">
          <button type="button" className="h-6 w-6 text-zinc-300 hover:bg-zinc-800" onClick={() => appearance.setFontSize(appearance.fontSize - 1)}>−</button>
          <span className="w-8 text-center text-xs tabular-nums text-zinc-100">{appearance.fontSize}</span>
          <button type="button" className="h-6 w-6 text-zinc-300 hover:bg-zinc-800" onClick={() => appearance.setFontSize(appearance.fontSize + 1)}>+</button>
        </div>
      </section>
    </div>
  );
}
