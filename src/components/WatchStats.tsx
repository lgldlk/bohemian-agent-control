import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Task } from '@/types';
import { PixelCard } from '@/components/pixel/PixelCard';
import { Activity, CheckCircle2 } from 'lucide-react';
import { useBoardAgentActivityMap, useBoardProcessStateMap } from '@/board/terminalActivity';
import { isActivePhase, projectCardStatus } from '@/lib/boardStatus';

/** 画板内容统计 */
export default function WatchStats({ tasks }: { tasks: Task[] }) {
  const { t } = useTranslation();
  const processes = useBoardProcessStateMap();
  const activity = useBoardAgentActivityMap();
  const stats = useMemo(() => {
    let running = 0;
    let completed = 0;
    for (const task of tasks) {
      const { task: phase } = projectCardStatus({
        processState: processes.get(task.id) ?? null,
        activity: activity.get(task.id) ?? null,
        record: task.status,
      });
      if (isActivePhase(phase)) running += 1;
      if (phase === 'completed') completed += 1;
    }
    return { running, completed, total: tasks.length };
  }, [activity, processes, tasks]);

  return (
    <div className="mb-5 grid grid-cols-2 gap-3">
      <PixelCard className="px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-zinc-100" />
          <span className="text-xl font-semibold tabular-nums text-zinc-50">{stats.running}</span>
          <span className="text-xs text-zinc-500">{t('cards.running')}</span>
        </div>
      </PixelCard>

      <PixelCard className="px-4 py-3">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-zinc-400" />
          <span className="text-xl font-semibold tabular-nums text-zinc-50">{stats.completed}</span>
          <span className="text-xs text-zinc-500">{t('cards.completed')}</span>
        </div>
      </PixelCard>
    </div>
  );
}
