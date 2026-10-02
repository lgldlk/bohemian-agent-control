import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';

import type { Task } from '@/types';
import AgentMark from '@/components/AgentMark';
import { parseAgentKind, type AgentKindId } from '@/lib/agentBrand';
import { useSpaceStore } from './spaceStore';
import { useWorkspaceStore } from '@/workspace/workspaceStore';
import { recentOrRunning, taskMatchesQuery } from '@/lib/taskSearch';
import { createTaskCardShape, focusTaskShape, getBoardEditor } from '@/board/boardEditor';
import { findFrameByGroupId } from '@/board/boardShapes';
import { useBoardMembership } from '@/board/boardMembershipStore';
import { FolderLoading, FolderRow, GroupPicker, PathChip, PinSessionCard, TabBtn } from './SpaceAddParts';

type Mode = 'pin' | 'start';
type AgentTab = 'all' | AgentKindId;

const AGENTS: AgentKindId[] = ['pi', 'claude-code', 'codex'];
const AGENT_TABS: { id: AgentTab; labelKey: string }[] = [
  { id: 'all', labelKey: 'add.agents.all' },
  { id: 'pi', labelKey: 'add.agents.pi' },
  { id: 'claude-code', labelKey: 'add.agents.claudeCode' },
  { id: 'codex', labelKey: 'add.agents.codex' },
];
const LAST_AGENT_KEY = 'bohemian-agent-control:last-agent';

interface SpaceAddModalProps {
  open: boolean;
  tasks: Task[];
  presetGroupId?: string;
  mode: Mode;
  hintCwd?: string;
  onClose: () => void;
  onCreateGroup: (name: string) => void;
  onStart: (cwd: string, agentKind: AgentKindId, groupId?: string) => void;
}

interface WorkspaceRow {
  path: string;
  name: string;
  lastActivity?: string;
  count?: number;
}

export default function SpaceAddModal({
  open,
  tasks,
  presetGroupId,
  mode,
  hintCwd,
  onClose,
  onCreateGroup,
  onStart,
}: SpaceAddModalProps) {
  const membership = useBoardMembership(tasks);
  const groups = membership.groups;
  const createGroup = useSpaceStore((s) => s.createGroup);
  const { t } = useTranslation();
  const lastUsed = useWorkspaceStore((s) => s.lastUsed);
  const favorites = useWorkspaceStore((s) => s.favorites);
  const toggleFavorite = useWorkspaceStore((s) => s.toggleFavorite);

  const [tab, setTab] = useState<Mode>(mode);
  const [agentKind, setAgentKind] = useState<AgentKindId>(loadLastAgent);
  const [agentTab, setAgentTab] = useState<AgentTab>('all');
  const [query, setQuery] = useState('');
  const [targetGroup, setTargetGroup] = useState<string | undefined>(presetGroupId ?? groups[0]?.id);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [workspaces, setWorkspaces] = useState<WorkspaceRow[]>([]);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browsePath, setBrowsePath] = useState('');
  const [browseParent, setBrowseParent] = useState<string | null>(null);
  const [browseEntries, setBrowseEntries] = useState<{ name: string; path: string }[]>([]);
  const [cwdDraft, setCwdDraft] = useState('');
  const [dirError, setDirError] = useState('');
  const [workspacesLoading, setWorkspacesLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [groupNameOpen, setGroupNameOpen] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState('');

  useEffect(() => {
    if (!open) return;
    setTab(mode);
    setAgentTab('all');
    setQuery('');
    setBrowseOpen(false);
    setTargetGroup(presetGroupId ?? groups[0]?.id);
    setCwdDraft(hintCwd || lastUsed || '');
    setAgentKind(loadLastAgent());
  }, [open, presetGroupId, mode, hintCwd, lastUsed, groups]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setWorkspacesLoading(true);
    fetch('/api/workspaces')
      .then((response) => response.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.workspaces)) setWorkspaces(data.workspaces);
        if (data.home) setCwdDraft((current) => current || data.home);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWorkspacesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const loadDir = (path: string) => {
    setDirError('');
    setBrowseOpen(true);
    setBrowseLoading(true);
    fetch(`/api/dir?path=${encodeURIComponent(path)}`)
      .then((response) => response.json())
      .then((data) => {
        if (!data.success) {
          setDirError(data.error || t('add.cannotOpen'));
          return;
        }
        setBrowsePath(data.path);
        setBrowseParent(data.parent);
        setBrowseEntries(data.entries ?? []);
        setCwdDraft(data.path);
      })
      .catch(() => setDirError(t('add.cannotOpenDir')))
      .finally(() => setBrowseLoading(false));
  };

  const inSpace = useMemo(() => new Set(membership.taskIds), [membership.taskIds]);
  const recents = useMemo(() => {
    const rows = [
      ...(hintCwd ? [{ path: hintCwd, name: folderName(hintCwd) }] : []),
      ...workspaces,
    ].filter((row, index, list) => list.findIndex((item) => item.path === row.path) === index);
    return rows.slice(0, 8);
  }, [hintCwd, workspaces]);

  const filtered = useMemo(() => {
    const byAgent =
      agentTab === 'all' ? tasks : tasks.filter((task) => normalizeAgentKind(task.agentKind) === agentTab);
    if (query.trim()) return { items: byAgent.filter((task) => taskMatchesQuery(task, query)), clipped: false };
    return recentOrRunning(byAgent);
  }, [tasks, query, agentTab]);

  const commitCreate = () => {
    const name = draft.trim();
    if (name) setTargetGroup(createGroup(name));
    setDraft('');
    setCreating(false);
  };

  const commitGroup = () => {
    const name = groupNameDraft.trim();
    if (!name) return;
    onCreateGroup(name);
    setGroupNameDraft('');
    setGroupNameOpen(false);
  };

  const startHere = () => {
    const cwd = cwdDraft.trim();
    if (!cwd || !agentKind) return;
    saveLastAgent(agentKind);
    onStart(cwd, agentKind, targetGroup);
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      onClick={onClose}
      className="fixed inset-0 z-[200000] flex items-center justify-center bg-black/70 p-4"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.15 }}
        onClick={(event) => event.stopPropagation()}
        className="relative flex max-h-[84vh] w-full max-w-xl flex-col border border-zinc-700 bg-black"
      >
        <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800 px-2 py-2">
          <TabBtn active={tab === 'start'} onClick={() => setTab('start')}>
            {t('add.newThread')}
          </TabBtn>
          <TabBtn active={tab === 'pin'} onClick={() => setTab('pin')}>
            {t('add.existing')}
          </TabBtn>
          <button
            type="button"
            onClick={() => {
              setGroupNameDraft('');
              setGroupNameOpen(true);
            }}
            title={t('add.addGroup')}
            className="border border-zinc-700 px-2 py-1 text-[12px] text-zinc-300 hover:border-white hover:text-white"
          >
            + {t('add.addGroup')}
          </button>
          <button
            type="button"
            onClick={onClose}
            title={t('add.close')}
            className="ml-auto px-2 py-1 text-[13px] text-zinc-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {tab === 'start' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <section>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">{t('add.pickAgent')}</div>
                <div className="grid grid-cols-3 gap-2">
                  {AGENTS.map((id) => {
                    const active = agentKind === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setAgentKind(id)}
                        className={`flex flex-col items-center gap-2 border px-2 py-3 text-[13px] transition-colors ${
                          active
                            ? 'border-white bg-white text-zinc-950'
                            : 'border-zinc-800 text-zinc-200 hover:border-zinc-500'
                        }`}
                      >
                        <AgentMark kind={id} className="agent-mark--lg" />
                        {t(`add.agents.${id === 'claude-code' ? 'claudeCode' : id}`)}
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="mb-2 text-[11px] uppercase tracking-wide text-zinc-500">{t('add.pickFolder')}</div>
                {favorites.length > 0 ? (
                  <FolderRow label={t('add.favorites')}>
                    {favorites.map((path) => (
                      <PathChip
                        key={path}
                        path={path}
                        active={cwdDraft === path}
                        onClick={() => {
                          setCwdDraft(path);
                          loadDir(path);
                        }}
                      />
                    ))}
                  </FolderRow>
                ) : null}
                <FolderRow label={t('add.recent')}>
                  {workspacesLoading ? (
                    <FolderLoading label={t('add.loadingFolders')} />
                  ) : recents.length === 0 ? (
                    <span className="text-xs text-zinc-600">{t('add.noRecent')}</span>
                  ) : (
                    recents.map((row) => (
                      <PathChip
                        key={row.path}
                        path={row.path}
                        label={row.name}
                        active={cwdDraft === row.path}
                        onClick={() => {
                          setCwdDraft(row.path);
                          loadDir(row.path);
                        }}
                      />
                    ))
                  )}
                </FolderRow>
                <div className="mt-2 flex gap-1">
                  <input
                    value={cwdDraft}
                    onChange={(event) => setCwdDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') startHere();
                    }}
                    placeholder="/Users/…/your-project"
                    className="min-w-0 flex-1 border border-zinc-700 bg-black px-2 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-400"
                  />
                  <button
                    type="button"
                    disabled={browseLoading}
                    onClick={() => loadDir(cwdDraft || '/')}
                    className="shrink-0 border border-zinc-700 px-2 text-xs text-zinc-300 hover:border-white hover:text-white disabled:cursor-wait disabled:text-zinc-600"
                  >
                    {browseLoading ? t('add.loading') : t('add.browse')}
                  </button>
                  <button
                    type="button"
                    title={favorites.includes(cwdDraft) ? t('add.unfav') : t('add.fav')}
                    onClick={() => cwdDraft && toggleFavorite(cwdDraft)}
                    className="shrink-0 border border-zinc-700 px-2 text-xs text-zinc-300 hover:border-white hover:text-white"
                  >
                    {favorites.includes(cwdDraft) ? '★' : '☆'}
                  </button>
                </div>
                {dirError ? <p className="mt-1 text-xs text-zinc-400">{dirError}</p> : null}
                {browseOpen ? (
                  <div className="mt-2 border border-zinc-800">
                    <div className="flex items-center gap-2 border-b border-zinc-800 px-2 py-1.5 text-xs text-zinc-500">
                      {browseParent && !browseLoading ? (
                        <button type="button" onClick={() => loadDir(browseParent)} className="text-zinc-300 hover:text-white">
                          {t('add.up')}
                        </button>
                      ) : null}
                      <span className="min-w-0 truncate">{browsePath || cwdDraft}</span>
                    </div>
                    <div className="max-h-40 overflow-y-auto">
                      {browseLoading ? (
                        <div className="px-2 py-3">
                          <FolderLoading label={t('add.loadingFolder')} />
                        </div>
                      ) : browseEntries.length === 0 ? (
                        <div className="px-2 py-3 text-xs text-zinc-600">{t('add.noSub')}</div>
                      ) : (
                        browseEntries.map((entry) => (
                          <button
                            key={entry.path}
                            type="button"
                            onClick={() => loadDir(entry.path)}
                            className="block w-full truncate px-2 py-1.5 text-left text-[13px] text-zinc-200 hover:bg-zinc-900"
                          >
                            {entry.name}/
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </section>

              <GroupPicker
                groups={groups}
                targetGroup={targetGroup}
                creating={creating}
                draft={draft}
                onPick={setTargetGroup}
                onStartCreate={() => setCreating(true)}
                onDraft={setDraft}
                onCommitCreate={commitCreate}
                onCancelCreate={() => {
                  setDraft('');
                  setCreating(false);
                }}
              />
            </div>
            <div className="shrink-0 border-t border-zinc-800 p-3">
              <button
                type="button"
                disabled={!cwdDraft.trim() || !agentKind}
                onClick={startHere}
                className="w-full bg-white px-2 py-2.5 text-[13px] font-medium text-black hover:bg-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-800 disabled:text-zinc-500"
              >
                {t('add.startWith', {
                  agent: t(`add.agents.${agentKind === 'claude-code' ? 'claudeCode' : agentKind}`),
                })}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="shrink-0 space-y-2 border-b border-zinc-800 px-3 py-3">
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t('add.search')}
                className="w-full border border-zinc-700 bg-black px-2 py-1.5 text-[13px] text-zinc-100 outline-none placeholder:text-zinc-600 focus:border-zinc-400"
              />
              <div className="flex flex-wrap items-center gap-1">
                {AGENT_TABS.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setAgentTab(item.id)}
                    className={`inline-flex items-center gap-1 border px-2 py-1 text-[12px] ${
                      agentTab === item.id
                        ? 'border-white bg-white text-black'
                        : 'border-zinc-800 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200'
                    }`}
                  >
                    {item.id !== 'all' ? <AgentMark kind={item.id} /> : null}
                    {t(item.labelKey)}
                  </button>
                ))}
              </div>
            </div>
            <GroupPicker
              groups={groups}
              targetGroup={targetGroup}
              creating={creating}
              draft={draft}
              onPick={setTargetGroup}
              onStartCreate={() => setCreating(true)}
              onDraft={setDraft}
              onCommitCreate={commitCreate}
              onCancelCreate={() => {
                setDraft('');
                setCreating(false);
              }}
            />
            <div className="flex-1 overflow-y-auto p-3">
              {filtered.clipped ? <div className="pb-2 text-[12px] text-zinc-500">{t('add.recentOnly')}</div> : null}
              {filtered.items.length === 0 ? (
                <div className="px-2 py-6 text-center text-[13px] text-zinc-600">{t('add.noMatch')}</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {filtered.items.map((task) => (
                    <PinSessionCard
                      key={task.id}
                      task={task}
                      added={inSpace.has(task.id)}
                      onPin={() => {
                        // Canvas is the membership source of truth. Pinning an
                        // existing session creates its card on this board.
                        const editor = getBoardEditor();
                        const frame = editor && targetGroup && targetGroup !== 'default'
                          ? findFrameByGroupId(editor, targetGroup)
                          : undefined;
                        createTaskCardShape(task.id, 120, 120, task, frame?.id);
                        focusTaskShape(task.id);
                        onClose();
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {groupNameOpen ? (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 p-6" onClick={() => setGroupNameOpen(false)}>
            <form
              className="w-full max-w-sm border border-zinc-700 bg-zinc-950 p-4 shadow-2xl"
              onSubmit={(event) => {
                event.preventDefault();
                commitGroup();
              }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-3 text-sm font-medium text-zinc-100">{t('add.groupNameTitle')}</div>
              <input
                autoFocus
                value={groupNameDraft}
                onChange={(event) => setGroupNameDraft(event.target.value)}
                placeholder={t('add.groupNamePlaceholder')}
                className="w-full border border-zinc-700 bg-black px-2 py-2 text-sm text-zinc-100 outline-none focus:border-zinc-300"
              />
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setGroupNameOpen(false)} className="border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:text-white">
                  {t('add.cancel')}
                </button>
                <button type="submit" disabled={!groupNameDraft.trim()} className="bg-white px-3 py-1.5 text-xs text-black disabled:bg-zinc-800 disabled:text-zinc-500">
                  {t('add.confirm')}
                </button>
              </div>
            </form>
          </div>
        ) : null}
      </motion.div>
    </motion.div>,
    document.body,
  );
}

function loadLastAgent(): AgentKindId {
  try {
    const value = localStorage.getItem(LAST_AGENT_KEY);
    if (value === 'pi' || value === 'claude-code' || value === 'codex') return value;
  } catch {
    /* ignore */
  }
  return 'pi';
}

function saveLastAgent(kind: AgentKindId) {
  try {
    localStorage.setItem(LAST_AGENT_KEY, kind);
  } catch {
    /* ignore */
  }
}

function folderName(path: string): string {
  return path.split('/').filter(Boolean).pop() || path;
}

function normalizeAgentKind(value?: string): Exclude<AgentTab, 'all'> | 'unknown' {
  return parseAgentKind(value)?.id ?? 'unknown';
}
