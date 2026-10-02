import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@/types';
import AgentMark from '@/components/AgentMark';
import BloubStatusIcon from '@/components/BloubStatusIcon';
import ModelMark from '@/components/ModelMark';
import TokenCount from '@/components/TokenCount';
import { useAgentPhase } from '@/board/useAgentPhase';
import { isRunningPhase } from '@/lib/boardStatus';

export function PinSessionCard({ task, added, onPin }: { task: Task; added: boolean; onPin: () => void }) {
  const { t } = useTranslation();
  const card = useAgentPhase(task.id, task.status);
  const title = task.name || t('board.loadingTitle');

  return (
    <button
      type="button"
      disabled={added}
      onClick={onPin}
      title={added ? t('add.onBoard') : t('add.pin')}
      className={`tl-task-card is-pick${isRunningPhase(card.task) ? ' is-run' : ''}${added ? ' is-added' : ''}`}
      style={{ height: 104, borderRadius: 14 }}
    >
      <div className="tl-task-card__bot">
        <BloubStatusIcon status={card.task} size={64} paper="#16161c" />
        <AgentMark kind={task.agentKind} className="tl-task-card__agent" />
      </div>
      <div className="tl-task-card__body">
        <div className="tl-task-card__top">
          <span className="tl-task-card__project" title={task.project}>{task.project || '—'}</span>
          {added ? <span className="shrink-0 text-[11px] text-zinc-500">{t('add.onBoard')}</span> : null}
        </div>
        <div className="tl-task-card__title" title={title}>{title}</div>
        <div className="tl-task-card__meta">
          <ModelMark model={task.model} provider={task.provider} />
          <TokenCount value={task.tokenCount} />
        </div>
      </div>
    </button>
  );
}

export function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={`h-8 px-3 text-[13px] ${active ? 'bg-white text-black' : 'text-zinc-400 hover:text-zinc-100'}`}>
      {children}
    </button>
  );
}

export function FolderLoading({ label }: { label: string }) {
  return <div className="flex items-center gap-2 text-xs text-zinc-500"><span className="add-folder-dots" aria-hidden><span /><span /><span /></span>{label}</div>;
}

export function FolderRow({ label, children }: { label: string; children: ReactNode }) {
  return <div className="mb-2"><div className="mb-1 text-[11px] text-zinc-600">{label}</div><div className="flex flex-wrap gap-1.5">{children}</div></div>;
}

export function PathChip({ path, label, active, onClick }: { path: string; label?: string; active?: boolean; onClick: () => void }) {
  const name = label || path.split('/').filter(Boolean).pop() || path;
  return (
    <button type="button" title={path} onClick={onClick} className={`max-w-full truncate border px-2 py-1 text-xs ${active ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-400 hover:border-zinc-400 hover:text-zinc-100'}`}>
      {name}
    </button>
  );
}

export function GroupPicker(props: {
  groups: { id: string; name: string }[];
  targetGroup?: string;
  creating: boolean;
  draft: string;
  onPick: (id: string) => void;
  onStartCreate: () => void;
  onDraft: (value: string) => void;
  onCommitCreate: () => void;
  onCancelCreate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[11px] uppercase tracking-wide text-zinc-500">{t('add.dropIn')}</span>
      {props.groups.map((group) => {
        const active = props.targetGroup === group.id;
        const label = group.id === 'default' ? t('board.ungrouped') : group.name;
        return <button key={group.id} type="button" onClick={() => props.onPick(group.id)} className={`border px-2 py-1 text-xs ${active ? 'border-white bg-white text-black' : 'border-zinc-700 text-zinc-400 hover:border-zinc-400 hover:text-zinc-100'}`}>{label}</button>;
      })}
      {props.creating ? (
        <input autoFocus value={props.draft} onChange={(event) => props.onDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') props.onCommitCreate(); if (event.key === 'Escape') props.onCancelCreate(); }} onBlur={props.onCommitCreate} placeholder={t('add.newGroup')} className="w-32 border border-zinc-600 bg-black px-2 py-1 text-xs text-zinc-100 outline-none placeholder:text-zinc-600" />
      ) : (
        <button type="button" onClick={props.onStartCreate} className="border border-dashed border-zinc-700 px-2 py-1 text-xs text-zinc-500 hover:border-zinc-400 hover:text-zinc-100">{t('add.newGroupBtn')}</button>
      )}
    </div>
  );
}
