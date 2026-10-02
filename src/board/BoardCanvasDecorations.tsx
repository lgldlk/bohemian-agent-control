import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditor, type TLGridProps } from 'tldraw';
import { useGroupActionEvents } from './events';

/** Contextual grouping controls shown for selected task cards. */
export function GroupActionBar() {
  const { t } = useTranslation();
  const { visible, canGroup, canUngroup, group, ungroup, isolate } = useGroupActionEvents();
  if (!visible) return null;

  return (
    <div className="tl-group-bar" onPointerDown={isolate}>
      {canGroup && <button type="button" className="px-btn px-btn-primary box-shadow-margin h-8 px-3 pixel-font text-[8px]" onClick={group}>GROUP</button>}
      {canUngroup && <button type="button" className="px-btn px-btn-dark box-shadow-margin h-8 px-3 pixel-font text-[8px]" onClick={ungroup}>UNGROUP</button>}
      <span className="tl-group-bar__hint">{canGroup ? t('board.groupHint') : t('board.ungroupHint')}</span>
    </div>
  );
}

/** PixelAct canvas grid that follows camera translation and zoom. */
export function PixelGrid({ x, y, z, size }: TLGridProps) {
  const editor = useEditor();
  const rawId = useId().replace(/:/g, '');
  const steps = editor.options.gridSteps;
  return (
    <svg className="tl-grid" aria-hidden="true">
      <defs>
        {steps.map(({ min, mid, step }, i) => {
          const s = step * size * z;
          if (s < 4) return null;
          const xo = (((x * z) % s) + s) % s;
          const yo = (((y * z) % s) + s) % s;
          const t = z < mid ? Math.max(0, (z - min) / Math.max(mid - min, 0.001)) : 1;
          const alpha = (step >= 4 ? 0.08 : 0.035) * t;
          return (
            <pattern key={i} id={`${rawId}-${step}`} width={s} height={s} patternUnits="userSpaceOnUse" x={xo} y={yo}>
              <path d={`M ${s} 0 L 0 0 0 ${s}`} fill="none" stroke={`rgba(244,244,245,${alpha})`} strokeWidth={0.5} />
            </pattern>
          );
        })}
      </defs>
      {steps.map(({ step }, i) => <rect key={i} width="100%" height="100%" fill={`url(#${rawId}-${step})`} />)}
    </svg>
  );
}
