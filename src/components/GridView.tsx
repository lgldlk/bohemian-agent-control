import DeletedTaskCard from './DeletedTaskCard';
import TaskCard from './TaskCard';
import type { Task } from '@/types';

export default function GridView({
  tasks,
  onSelect,
  changedIds,
  onRemove,
}: {
  tasks: Task[];
  onSelect: (t: Task) => void;
  changedIds?: string[];
  onRemove?: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
      {tasks.map((t) => t.status === 'deleted' ? (
        <DeletedTaskCard key={t.id} task={t} onRemove={onRemove} />
      ) : (
        <TaskCard
          key={t.id}
          task={t}
          onSelect={onSelect}
          changed={changedIds?.includes(t.id)}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}
