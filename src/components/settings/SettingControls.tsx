import type { ReactNode } from 'react';

export function SettingsPanel({ title, hint, className = '', children }: { title: string; hint?: string; className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-[10px] border border-zinc-800 bg-[#101014] p-4 ${className}`}>
      <div className="mb-4">
        <h3 className="text-[12px] font-medium text-zinc-200">{title}</h3>
        {hint ? <p className="mt-1 max-w-2xl text-[10px] leading-4 text-zinc-600">{hint}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function ChoiceChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`flex items-center gap-2 border px-2.5 py-1.5 text-[11px] transition-colors active:translate-y-px ${active ? 'border-zinc-200 bg-zinc-100 text-black' : 'border-zinc-700 bg-zinc-950 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'}`}>
      {children}
    </button>
  );
}

export function ColorRow({ label, value, custom, onChange, onReset, resetLabel }: { label: string; value: string; custom: boolean; onChange: (value: string) => void; onReset: () => void; resetLabel: string }) {
  return (
    <div className="flex min-h-12 items-center gap-3 py-2 first:pt-0 last:pb-0">
      <label className="relative h-8 w-8 shrink-0 cursor-pointer overflow-hidden border border-zinc-600" style={{ background: value }}>
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} aria-label={label} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
      </label>
      <span className="min-w-0 flex-1"><span className="block text-[11px] text-zinc-300">{label}</span><span className="mt-0.5 block font-mono text-[10px] uppercase text-zinc-600">{value}</span></span>
      {custom ? <button type="button" onClick={onReset} className="text-[10px] text-zinc-500 hover:text-white active:translate-y-px">{resetLabel}</button> : <span className="text-[9px] uppercase tracking-wide text-zinc-700">{resetLabel}</span>}
    </div>
  );
}

export function SliderRow({ label, value, min, max, step, current, onChange }: { label: string; value: string; min: number; max: number; step: number; current: number; onChange: (value: number) => void }) {
  return (
    <label className="grid grid-cols-[86px_minmax(0,1fr)_44px] items-center gap-3 text-[11px] text-zinc-400">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={current} onChange={(event) => onChange(Number(event.target.value))} className="min-w-0 accent-zinc-100" />
      <span className="text-right font-mono text-[10px] text-zinc-500">{value}</span>
    </label>
  );
}

export function SettingSwitch({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4">
      <span className="min-w-0"><span className="block text-[11px] text-zinc-300">{label}</span><span className="mt-1 block text-[10px] leading-4 text-zinc-600">{hint}</span></span>
      <span className={`relative mt-0.5 h-5 w-9 shrink-0 border transition-colors ${checked ? 'border-zinc-200 bg-zinc-100' : 'border-zinc-700 bg-zinc-950'}`}>
        <span className={`absolute top-0.5 h-3.5 w-3.5 transition-transform ${checked ? 'translate-x-[17px] bg-zinc-950' : 'translate-x-0.5 bg-zinc-600'}`} />
        <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="sr-only" />
      </span>
    </label>
  );
}
