import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Search, SquareTerminal, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useEditor, useValue, type TLShapeId } from 'tldraw';
import type { Task } from '@/types';
import AgentMark from '@/components/AgentMark';
import { projectCardStatus, type BoardAgentStatus } from '@/lib/boardStatus';
import { useBoardAgentActivityMap, useBoardProcessStateMap } from './terminalActivity';
import { isBusinessGroupFrame } from './boardShapes';
import {
  buildAgentNavigatorGroups,
  countAgentNavigatorFilters,
  type AgentNavigatorEntry,
  type AgentNavigatorFilter,
} from './agentQuickNavigatorModel';

interface AgentQuickNavigatorProps {
  tasks: readonly Task[];
  onOpenTerminal: (taskId: string) => void;
}

interface CardProjection {
  taskId: string;
  shapeId: TLShapeId;
  groupId: string;
  groupName: string;
  groupX: number;
  groupY: number;
  x: number;
  y: number;
}

const STATUS_DOT: Record<BoardAgentStatus, string> = {
  working: 'bg-emerald-400',
  running: 'bg-zinc-100',
  blocked: 'bg-amber-400',
  starting: 'bg-zinc-300 animate-pulse',
  idle: 'bg-zinc-500',
  pending: 'bg-zinc-300 animate-pulse',
  completed: 'bg-zinc-700',
  deleted: 'bg-zinc-800',
  error: 'bg-red-400',
  unknown: 'bg-zinc-700',
};

export default function AgentQuickNavigator({ tasks, onOpenTerminal }: AgentQuickNavigatorProps) {
  const editor = useEditor();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AgentNavigatorFilter>('all');
  const searchRef = useRef<HTMLInputElement>(null);
  const processStates = useBoardProcessStateMap();
  const activities = useBoardAgentActivityMap();

  const projections = useValue<CardProjection[]>(
    'agent quick navigator cards',
    () => {
      const shapes = editor.getCurrentPageShapes();
      const byId = new Map(shapes.map((shape) => [shape.id, shape]));
      return shapes
        .filter((shape) => shape.type === 'task-card')
        .map((shape) => {
          const props = shape.props as { taskId?: string };
          const taskId = props.taskId ?? '';
          const bounds = editor.getShapePageBounds(shape);
          const parent = byId.get(shape.parentId as TLShapeId);
          const businessFrame = parent && isBusinessGroupFrame(parent) ? parent : undefined;
          const frameBounds = businessFrame ? editor.getShapePageBounds(businessFrame) : undefined;
          return {
            taskId,
            shapeId: shape.id,
            groupId: businessFrame ? businessFrame.id : 'ungrouped',
            groupName: businessFrame
              ? String((businessFrame.props as { name?: string }).name || t('board.unnamed'))
              : t('board.ungrouped'),
            groupX: frameBounds?.x ?? Number.MAX_SAFE_INTEGER,
            groupY: frameBounds?.y ?? Number.MAX_SAFE_INTEGER,
            x: bounds?.x ?? shape.x,
            y: bounds?.y ?? shape.y,
          };
        })
        .filter((item) => item.taskId);
    },
    [editor, t],
  );

  const selectedShapeKey = useValue(
    'agent quick navigator selection',
    () => editor.getSelectedShapeIds().join('|'),
    [editor],
  );
  const selectedShapeIds = useMemo(() => new Set(selectedShapeKey.split('|').filter(Boolean)), [selectedShapeKey]);
  const tasksById = useMemo(() => new Map(tasks.map((task) => [task.id, task])), [tasks]);

  const entries = useMemo<AgentNavigatorEntry[]>(() => projections.flatMap((projection) => {
    const task = tasksById.get(projection.taskId);
    if (!task) return [];
    const status = projectCardStatus({
      processState: processStates.get(task.id),
      activity: activities.get(task.id),
      record: task.status,
    }).task;
    return [{
      ...projection,
      shapeId: projection.shapeId,
      name: task.name,
      project: task.project,
      workingDir: task.workingDir,
      model: task.model,
      agentKind: task.agentKind,
      status,
    }];
  }), [activities, processStates, projections, tasksById]);

  const counts = useMemo(() => countAgentNavigatorFilters(entries), [entries]);
  const groups = useMemo(
    () => buildAgentNavigatorGroups(entries, query, filter),
    [entries, filter, query],
  );

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const focusAgent = (entry: AgentNavigatorEntry) => {
    const shape = editor.getShape(entry.shapeId as TLShapeId);
    if (!shape) return;
    editor.select(shape.id);
    editor.zoomToSelection({ animation: { duration: 220 } });
  };

  return (
    <div
      className="pointer-events-auto absolute left-3 top-3 z-[160000]"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {!open ? (
        <button
          type="button"
          aria-expanded={false}
          aria-controls="agent-quick-navigator"
          title={t('board.agentNavigator.open')}
          onClick={() => setOpen(true)}
          className="px-btn px-btn-dark box-shadow-margin flex h-9 items-center gap-2 px-3 text-xs text-zinc-200"
        >
          <Bot className="h-4 w-4" />
          <span className="pixel-font text-[8px]">AGENTS</span>
          <span className="min-w-5 border-l border-zinc-700 pl-2 text-right text-[11px] tabular-nums text-zinc-400">
            {entries.length}
          </span>
        </button>
      ) : (
        <section
          id="agent-quick-navigator"
          aria-label={t('board.agentNavigator.title')}
          className="flex max-h-[min(560px,65vh)] w-[min(320px,calc(100vw-24px))] flex-col border border-zinc-700 bg-zinc-950 shadow-2xl"
        >
          <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-2">
            <Bot className="h-4 w-4 text-zinc-300" />
            <span className="pixel-font text-[9px] text-zinc-100">AGENTS</span>
            <span className="text-[11px] tabular-nums text-zinc-500">{entries.length}</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              title={t('board.agentNavigator.close')}
              aria-label={t('board.agentNavigator.close')}
              className="ml-auto flex h-7 w-7 items-center justify-center text-zinc-500 hover:bg-zinc-800 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="shrink-0 border-b border-zinc-800 p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-600" />
              <input
                ref={searchRef}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('board.agentNavigator.search')}
                className="w-full border border-zinc-800 bg-black py-1.5 pl-8 pr-7 text-xs text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-500"
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label={t('app.clearSearch')}
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center text-zinc-600 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              ) : null}
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1">
              <FilterButton active={filter === 'all'} onClick={() => setFilter('all')}>
                {t('board.agentNavigator.all')} {counts.all}
              </FilterButton>
              <FilterButton active={filter === 'active'} onClick={() => setFilter('active')}>
                {t('board.agentNavigator.active')} {counts.active}
              </FilterButton>
              <FilterButton active={filter === 'attention'} onClick={() => setFilter('attention')}>
                {t('board.agentNavigator.attention')} {counts.attention}
              </FilterButton>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {groups.length === 0 ? (
              <div className="px-3 py-8 text-center text-xs text-zinc-600">
                {entries.length === 0
                  ? t('board.agentNavigator.empty')
                  : t('board.agentNavigator.noMatch')}
              </div>
            ) : (
              <div className="space-y-2">
                {groups.map((group) => (
                  <div key={group.id} className="border border-zinc-800 bg-black/30">
                    <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-zinc-400">
                        {group.name}
                      </span>
                      <span className="pixel-font text-[8px] tabular-nums text-zinc-600">
                        {group.entries.length}
                      </span>
                    </div>
                    <div className="divide-y divide-zinc-900">
                      {group.entries.map((entry) => {
                        const selected = selectedShapeIds.has(entry.shapeId);
                        return (
                          <div
                            key={entry.taskId}
                            className={`group flex items-center gap-1 ${selected ? 'bg-zinc-100 text-black' : 'text-zinc-200 hover:bg-zinc-900'}`}
                          >
                            <button
                              type="button"
                              title={t('board.agentNavigator.locate', { name: entry.name })}
                              onClick={() => focusAgent(entry)}
                              onDoubleClick={() => {
                                focusAgent(entry);
                                onOpenTerminal(entry.taskId);
                              }}
                              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left"
                            >
                              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[entry.status]}`} title={t(`status.${entry.status}`)} />
                              <AgentMark kind={entry.agentKind} className="shrink-0" />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-[12px] font-medium">{entry.name}</span>
                                <span className={`mt-0.5 block truncate text-[10px] ${selected ? 'text-zinc-600' : 'text-zinc-600'}`}>
                                  {[entry.project, entry.model].filter(Boolean).join(' · ')}
                                </span>
                              </span>
                            </button>
                            <button
                              type="button"
                              title={t('board.agentNavigator.openTerminal')}
                              aria-label={t('board.agentNavigator.openTerminal')}
                              onClick={() => {
                                focusAgent(entry);
                                onOpenTerminal(entry.taskId);
                              }}
                              className={`mr-1 flex h-7 w-7 shrink-0 items-center justify-center ${selected ? 'text-zinc-600 hover:bg-zinc-300 hover:text-black' : 'text-zinc-600 opacity-0 hover:bg-zinc-800 hover:text-white group-hover:opacity-100 focus:opacity-100'}`}
                            >
                              <SquareTerminal className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border px-1 py-1 text-[10px] transition-colors ${
        active
          ? 'border-zinc-200 bg-zinc-100 text-black'
          : 'border-zinc-800 text-zinc-500 hover:border-zinc-600 hover:text-zinc-200'
      }`}
    >
      {children}
    </button>
  );
}
