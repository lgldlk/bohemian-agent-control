import { Archive, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@/types';
import AgentMark from '@/components/AgentMark';
import BloubStatusIcon from '@/components/BloubStatusIcon';
import { PixelCard } from '@/components/pixel/PixelCard';
import { formatRelativeTime } from '@/i18n';

export default function DeletedTaskCard({ task, onRemove }: { task: Task; onRemove?: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <PixelCard className="flex h-full flex-col border-dashed border-zinc-700 bg-zinc-950/70 p-4 opacity-80">
      <div className="mb-3 flex items-center gap-2 text-[13px] text-zinc-500">
        <BloubStatusIcon status="deleted" size={36} paper="#09090b" />
        <AgentMark kind={task.agentKind} />
        <span className="font-medium text-zinc-400">{t('status.deleted')}</span>
        <Archive className="ml-auto h-4 w-4 text-zinc-600" />
      </div>
      <h3 className="line-clamp-3 text-[15px] font-medium leading-relaxed text-zinc-400">
        {task.name}
      </h3>
      <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-zinc-600">
        {t('cards.deletedBody')}
      </p>
      <div className="mt-3 flex items-center gap-2 border-t border-zinc-800/80 pt-2.5 text-xs text-zinc-600">
        <span className="min-w-0 flex-1 truncate">{task.project}</span>
        <span>{formatRelativeTime(task.deletedAt ?? task.lastActivity)}</span>
      </div>
      {onRemove && (
        <button
          type="button"
          onClick={() => onRemove(task.id)}
          className="mt-3 flex items-center justify-center gap-1.5 border border-zinc-800 px-2 py-1.5 text-xs text-zinc-500 hover:border-zinc-500 hover:text-zinc-200"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t('cards.removeDeleted')}
        </button>
      )}
    </PixelCard>
  );
}
