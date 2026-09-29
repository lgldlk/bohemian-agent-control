import { Task } from '@/types';
import { X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import AgentMark from '@/components/AgentMark';
import ModelMark from '@/components/ModelMark';
import { PixelCard } from '@/components/pixel/PixelCard';
import BloubStatusIcon from '@/components/BloubStatusIcon';
import { useAgentPhase } from '@/board/useAgentPhase';
import StatusLamps from '@/components/StatusLamps';
import TokenCount from '@/components/TokenCount';

interface TaskCardProps {
  task: Task;
  onSelect: (t: Task) => void;
  changed?: boolean;
  onRemove?: (id: string) => void;
}

export default function TaskCard({ task, onSelect, changed, onRemove }: TaskCardProps) {
  const { t } = useTranslation();
  const status = useAgentPhase(task.id, task.status);
  return (
    <PixelCard
      hover
      className={`group flex h-full flex-col p-4 ${
        changed ? 'animate-[px-flash_1.2s_steps(2)_3]' : ''
      }`}
    >
      <button
        onClick={() => onSelect(task)}
        title={t('cards.openTerminal')}
        className="flex h-full w-full flex-col text-left"
      >
        <div className="mb-2 flex items-center gap-2 text-[13px]">
          <BloubStatusIcon status={status.task} size={36} paper="#131318" />
          <AgentMark kind={task.agentKind} />
          <StatusLamps status={status} />
          <span className="text-zinc-600">·</span>
          <span className="min-w-0 truncate text-zinc-500">{task.project}</span>
          {changed && <span className="shrink-0 text-zinc-200">· {t('status.updated')}</span>}
          {onRemove && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(task.id);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.stopPropagation();
                  onRemove(task.id);
                }
              }}
              title={t('cards.remove')}
              className="ml-auto shrink-0 border border-zinc-800 p-0.5 text-zinc-600 opacity-0 transition-colors hover:border-zinc-400 hover:text-zinc-200 group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </div>

        <h3 className="line-clamp-3 flex-none text-[15px] font-medium leading-relaxed text-zinc-100">
          {task.name}
        </h3>

        <div className="mt-3 flex items-center gap-4 border-t border-zinc-800/80 pt-2.5 text-[13px] text-zinc-500">
          <span className="flex min-w-0 items-center">
            <ModelMark model={task.model} provider={task.provider} />
          </span>
          <TokenCount value={task.tokenCount} />
        </div>
      </button>
    </PixelCard>
  );
}
