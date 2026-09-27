import type { ReactNode } from 'react';
import { stopEventPropagation } from 'tldraw';

export function MenuRow({
  label,
  icon,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white"
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

export function IconButton({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onPointerDown={stopEventPropagation}
      onPointerUp={stopEventPropagation}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={`tl-terminal__btn${danger ? ' is-danger' : ''}`}
    >
      {children}
    </button>
  );
}
