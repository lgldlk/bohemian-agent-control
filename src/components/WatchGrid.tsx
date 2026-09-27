import GridView from './GridView';
import WatchStats from './WatchStats';
import { useTranslation } from 'react-i18next';
import type { SpaceGroup } from '@/space/spaceStore';
import type { Task } from '@/types';
import { taskMatchesQuery } from '@/lib/taskSearch';

/** 卡片视图 = 画板同一份数据,按分组排 */
export default function WatchGrid(props: {
  groups: SpaceGroup[];
  byId: Map<string, Task>;
  changedIds: string[];
  search?: string;
  onRemove: (id: string) => void;
  onSelectTerminal: (id: string) => void;
  onAdd: (groupId?: string, mode?: 'pin' | 'start') => void;
}) {
  const { t } = useTranslation();
  const all = props.groups.flatMap((g) =>
    g.taskIds.map((id) => props.byId.get(id)).filter((t): t is Task => !!t)
  );
  const visible = all.filter((task) => taskMatchesQuery(task, props.search ?? ''));

  if (all.length === 0) {
    return (
      <div className="px-card mx-auto mt-10 max-w-lg p-10 text-center">
        <div className="pixel-font mb-4 text-[11px] text-zinc-100">BOARD EMPTY</div>
        <p className="mb-6 text-[15px] leading-relaxed text-zinc-400">
          {t('cards.emptyBody')}
        </p>
        <div className="flex justify-center gap-3">
          <button
            type="button"
            onClick={() => props.onAdd(undefined, 'start')}
            className="px-btn px-btn-primary box-shadow-margin h-8 px-3 pixel-font text-[8px]"
          >
            NEW
          </button>
          <button
            type="button"
            onClick={() => props.onAdd(undefined, 'pin')}
            className="px-btn px-btn-dark box-shadow-margin h-8 px-3 pixel-font text-[8px]"
          >
            PIN
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <WatchStats tasks={visible} />
      {props.groups.map((group) => {
        const items = group.taskIds
          .map((id) => props.byId.get(id))
          .filter((t): t is Task => !!t)
          .filter((t) => taskMatchesQuery(t, props.search ?? ''));
        if (items.length === 0) return null;
        return (
          <section key={group.id} className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <h2 className="text-[13px] font-medium text-zinc-100">
                {group.id === 'default' ? t('board.ungrouped') : group.name}
              </h2>
              <span className="pixel-font text-[10px] text-zinc-500">{items.length}</span>
              <button
                type="button"
                onClick={() => props.onAdd(group.id, 'pin')}
                className="ml-auto text-[13px] text-zinc-500 hover:text-white"
              >
                {t('cards.join')}
              </button>
            </div>
            <GridView
              tasks={items}
              changedIds={props.changedIds}
              onRemove={props.onRemove}
              onSelect={(t) => props.onSelectTerminal(t.id)}
            />
          </section>
        );
      })}
    </>
  );
}
