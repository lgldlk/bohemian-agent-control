import type * as React from 'react';
import type { Task } from '@/types';
import { formatRelativeTime } from '@/i18n';
import AgentMark from '@/components/AgentMark';
import BloubStatusIcon from '@/components/BloubStatusIcon';
import ModelMark from '@/components/ModelMark';
import StatusLamps from '@/components/StatusLamps';
import { useAgentPhase } from '@/board/useAgentPhase';

export interface BoardPinCardProps {
  task: Task;
  selected: boolean;
  connecting: boolean;
  changed: boolean;
  onCardDown: (e: React.MouseEvent, id: string) => void;
  onResizeDown: (e: React.MouseEvent, id: string) => void;
  onPortDown: (e: React.MouseEvent, id: string) => void;
  onOpen: (id: string) => void;
  onRemove: (id: string) => void;
  onMoveToGroup: (taskId: string, groupId: string) => void;
  groups: { id: string; name: string }[];
  groupId: string;
}

export default function BoardPinCard({
  task,
  selected,
  connecting,
  changed,
  onCardDown,
  onResizeDown,
  onPortDown,
  onOpen,
  onRemove,
  onMoveToGroup,
  groups,
  groupId,
}: BoardPinCardProps) {
  const card = useAgentPhase(task.id, task.status);
  const live = card.active;

  return (
    <div
      onPointerDown={(e) => onCardDown(e, task.id)}
      onDoubleClick={() => onOpen(task.id)}
      className={`group relative flex h-full w-full gap-3 rounded-[10px] border bg-[#131318] p-3 ${
        selected ? 'border-zinc-100' : 'border-[#2e2e36]'
      } ${live ? 'is-run' : ''} ${changed ? 'animate-[px-flash_1.2s_steps(2)_3]' : ''}`}
    >
      <div className="relative shrink-0">
        <BloubStatusIcon status={card.task} size={84} paper="#131318" />
        <AgentMark kind={task.agentKind} className="tl-task-card__agent" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
      {/* 顶部状态行 */}
      <div className="flex items-center gap-2 text-xs">
        <StatusLamps status={card} />
        <span className="ml-auto flex shrink-0 items-center gap-1.5">
          <select
            value={groupId}
            onChange={(e) => onMoveToGroup(task.id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            className="max-w-[88px] truncate border border-zinc-800 bg-black px-1 py-0.5 text-xs text-zinc-400 outline-none"
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            title="移除"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(task.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
            className="shrink-0 px-1 text-sm leading-none text-zinc-500 transition-colors hover:text-white"
          >
            ✕
          </button>
        </span>
      </div>

      {/* 标题 */}
      <div className="mt-1.5 line-clamp-2 min-h-[40px] text-sm font-medium leading-snug text-zinc-100">
        {task.name}
      </div>

      {/* 副行 */}
      <div className="mt-1 flex min-w-0 items-center gap-1.5 truncate text-xs text-zinc-500">
        <span className="truncate">{task.project}</span>
        <span>·</span>
        <ModelMark model={task.model} provider={task.provider} />
        <span>· {task.messageCount}条 · {formatRelativeTime(task.lastActivity)}</span>
      </div>

      {/* 底部提示 */}
      <div className="mt-auto pt-2 text-[11px] text-zinc-600">双击打开预览</div>
      </div>

      {/* 左连线端口 */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onPortDown(e, task.id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        title="拖出连线"
        className={`absolute left-[-7px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 cursor-crosshair bg-zinc-100 transition-opacity ${
          connecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />
      {/* 右连线端口 */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onPortDown(e, task.id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        title="拖出连线"
        className={`absolute right-[-7px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 cursor-crosshair bg-zinc-100 transition-opacity ${
          connecting ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      />

      {/* 右下角缩放手柄 */}
      <div
        onPointerDown={(e) => {
          e.stopPropagation();
          onResizeDown(e, task.id);
        }}
        onDoubleClick={(e) => e.stopPropagation()}
        title="拖动缩放"
        className="absolute bottom-1 right-1 flex h-4 w-4 cursor-nwse-resize flex-col items-end justify-end gap-[3px] p-[2px]"
      >
        <div className="h-[2px] w-3 bg-zinc-100/80" />
        <div className="h-[2px] w-2 bg-zinc-100/80" />
      </div>
    </div>
  );
}
