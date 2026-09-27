import { useMemo, useState } from 'react';
import type { Task } from '@/types';
import { useSpaceStore } from './spaceStore';
import { useSpaceView } from './spaceView';

interface SpacePanelProps {
  tasks: Task[];
  onPreview: (id: string) => void;
  onAdd: (groupId?: string, mode?: 'pin' | 'start') => void;
}

/** 左栏"空间内容"面板:按分组展示空间内的会话 */
export default function SpacePanel({ tasks, onPreview, onAdd }: SpacePanelProps) {
  const groups = useSpaceStore((s) => s.groups);
  const removeFromSpace = useSpaceStore((s) => s.removeFromSpace);
  const createGroup = useSpaceStore((s) => s.createGroup);
  const renameGroup = useSpaceStore((s) => s.renameGroup);
  const deleteGroup = useSpaceStore((s) => s.deleteGroup);
  const toggleGroup = useSpaceStore((s) => s.toggleGroup);

  const focusId = useSpaceView((s) => s.focusId);
  const setFocus = useSpaceView((s) => s.setFocus);

  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');

  const commitRename = (id: string) => {
    const name = editingName.trim();
    if (name) renameGroup(id, name);
    setEditingGroupId(null);
    setEditingName('');
  };

  const commitCreate = () => {
    const name = draft.trim();
    if (name) createGroup(name);
    setDraft('');
    setCreating(false);
  };

  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-3 py-2.5">
        <span className="text-[13px] font-medium text-zinc-100">空间内容</span>
        <span className="pixel-font text-[10px] text-zinc-500">SPACE</span>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const items = group.taskIds
              .map((id) => byId.get(id))
              .filter((t): t is Task => t !== undefined);
            const editing = editingGroupId === group.id;
            return (
              <div key={group.id} className="border border-zinc-800">
                <div className="flex items-center gap-1 px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    title={group.collapsed ? '展开' : '折叠'}
                    className="w-5 shrink-0 text-center text-xs text-zinc-400 transition-colors hover:text-white"
                  >
                    {group.collapsed ? '▸' : '▾'}
                  </button>
                  {editing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(group.id);
                        if (e.key === 'Escape') {
                          setEditingGroupId(null);
                          setEditingName('');
                        }
                      }}
                      onBlur={() => commitRename(group.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="min-w-0 flex-1 border border-zinc-600 bg-black px-1 py-0.5 text-[13px] text-zinc-100 outline-none"
                    />
                  ) : (
                    <span
                      onDoubleClick={() => {
                        setEditingGroupId(group.id);
                        setEditingName(group.name);
                      }}
                      title="双击改名"
                      className="min-w-0 flex-1 cursor-default truncate text-[13px] font-medium text-zinc-100"
                    >
                      {group.name}
                    </span>
                  )}
                  <span className="pixel-font shrink-0 text-[10px] text-zinc-500">
                    {group.taskIds.length}
                  </span>
                  <button
                    type="button"
                    onClick={() => onAdd(group.id, 'pin')}
                    title="向该分组添加会话"
                    className="shrink-0 px-1 text-[13px] text-zinc-400 transition-colors hover:text-white"
                  >
                    +
                  </button>
                  {group.id !== 'default' && (
                    <button
                      type="button"
                      onClick={() => deleteGroup(group.id)}
                      title="删除分组"
                      className="shrink-0 px-1 text-[13px] text-zinc-500 transition-colors hover:text-white"
                    >
                      ✕
                    </button>
                  )}
                </div>

                {!group.collapsed && (
                  <div className="border-t border-zinc-800 p-1">
                    {items.length === 0 ? (
                      <div className="px-2 py-3 text-center text-xs text-zinc-600">
                        空分组,把会话加进来
                      </div>
                    ) : (
                      <div className="flex flex-col gap-0.5">
                        {items.map((task) => {
                          const focused = focusId === task.id;
                          const running = task.status === 'running';
                          return (
                            <div
                              key={task.id}
                              onClick={() => setFocus(task.id)}
                              onDoubleClick={() => onPreview(task.id)}
                              title={task.name}
                              className={`group flex cursor-default items-center gap-2 px-2 py-1.5 transition-colors ${
                                focused
                                  ? 'bg-white text-black'
                                  : 'text-zinc-100 hover:bg-zinc-900'
                              }`}
                            >
                              <span
                                className={`h-2 w-2 shrink-0 rounded-full ${
                                  running
                                    ? focused
                                      ? 'bg-black'
                                      : 'bg-white'
                                    : focused
                                      ? 'bg-zinc-500'
                                      : 'bg-zinc-600'
                                }`}
                              />
                              <span className="min-w-0 flex-1 truncate text-[14px]">
                                {task.name}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeFromSpace(task.id);
                                }}
                                title="移出空间"
                                className={`shrink-0 px-1 text-xs transition-colors ${
                                  focused
                                    ? 'text-zinc-500 hover:text-black'
                                    : 'text-zinc-600 opacity-0 hover:text-white group-hover:opacity-100'
                                }`}
                              >
                                ✕
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex shrink-0 flex-col gap-2 border-t border-zinc-800 p-2">
        {creating ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitCreate();
              if (e.key === 'Escape') {
                setDraft('');
                setCreating(false);
              }
            }}
            onBlur={commitCreate}
            placeholder="分组名称,回车创建"
            className="border border-zinc-600 bg-black px-2 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600"
          />
        ) : (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="border border-zinc-800 px-2 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-400 hover:text-white"
          >
            + 新分组
          </button>
        )}
        <button
          type="button"
          onClick={() => onAdd(undefined, 'start')}
          className="bg-white px-2 py-2 text-[13px] font-medium text-black transition-colors hover:bg-zinc-200"
        >
          ＋ 新对话
        </button>
        <button
          type="button"
          onClick={() => onAdd(undefined, 'pin')}
          className="border border-zinc-800 px-2 py-1.5 text-[13px] text-zinc-400 transition-colors hover:border-zinc-400 hover:text-white"
        >
          钉上已有
        </button>
      </div>
    </div>
  );
}
