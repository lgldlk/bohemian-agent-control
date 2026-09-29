import { useEffect, useMemo, useState } from 'react';
import type { Task } from '@/types';
import AgentMark from '@/components/AgentMark';
import ModelMark from '@/components/ModelMark';
import { folderKeyOf } from '@/domain/folderKey';
import { formatTokenCount } from '@/lib/tokenFormat';
import { buildUsageHeatmap } from './heatmap';
import { UsageBreakdownPie, type UsageBreakdownRow } from './UsageBreakdownPie';
import { UsageHeatmapChart } from './UsageHeatmapChart';
import { UsageTrendChart, type UsageTrendDay } from './UsageTrendChart';

const RANGE_STORAGE_KEY = 'bohemian-agent-control:usage-range:v1';
const ranges = [
  { id: 1, label: 'TODAY' },
  { id: 7, label: '7D' },
  { id: 30, label: '30D' },
  { id: 90, label: '90D' },
] as const;
const AGENT_ORDER = ['codex', 'pi', 'claude-code'];

type RangeDays = (typeof ranges)[number]['id'];
type UsageRow = Task & { tokens: number | null };

function readRange(): RangeDays {
  try {
    const value = Number(localStorage.getItem(RANGE_STORAGE_KEY));
    return ranges.some((range) => range.id === value) ? value as RangeDays : 7;
  } catch {
    return 7;
  }
}

function dayKey(value: Date): string {
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function dateFromDayKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function formatActivity(value: Date): string {
  return value.toLocaleString(undefined, { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function tokens(value: number): string {
  return formatTokenCount(value) ?? '0';
}

function agentLabel(kind: string): string {
  if (kind === 'claude-code') return 'CLAUDE';
  return kind.toUpperCase();
}

function groupRows(rows: UsageRow[], keyOf: (row: UsageRow) => string): UsageBreakdownRow[] {
  const map = new Map<string, UsageBreakdownRow>();
  for (const row of rows) {
    const key = keyOf(row) || 'Unknown';
    const current = map.get(key) ?? { key, tokens: 0, sessions: 0, missing: 0 };
    current.sessions += 1;
    if (row.tokens === null) current.missing += 1;
    else current.tokens += row.tokens;
    map.set(key, current);
  }
  return [...map.values()].sort((a, b) => b.tokens - a.tokens || b.sessions - a.sessions);
}

export function TokenUsageDashboard({ tasks, onFocusTask }: { tasks: readonly Task[]; onFocusTask: (taskId: string) => void }) {
  const [range, setRange] = useState<RangeDays>(readRange);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [now, setNow] = useState(() => new Date());

  const rows = useMemo<UsageRow[]>(() => tasks
    .filter((task) => task.status !== 'deleted' && task.lastActivity instanceof Date)
    .map((task) => ({
      ...task,
      tokens: typeof task.tokenCount === 'number' && Number.isFinite(task.tokenCount) && task.tokenCount >= 0
        ? task.tokenCount
        : null,
    })), [tasks]);

  const availableAgents = useMemo(() => [...new Set(rows.map((row) => row.agentKind ?? 'unknown'))]
    .sort((a, b) => {
      const ai = AGENT_ORDER.indexOf(a);
      const bi = AGENT_ORDER.indexOf(b);
      return (ai < 0 ? AGENT_ORDER.length : ai) - (bi < 0 ? AGENT_ORDER.length : bi) || a.localeCompare(b);
    }), [rows]);

  useEffect(() => {
    let timer = 0;
    const scheduleMidnightRefresh = () => {
      const current = new Date();
      const next = new Date(current);
      next.setHours(24, 0, 1, 0);
      timer = window.setTimeout(() => {
        setNow(new Date());
        scheduleMidnightRefresh();
      }, next.getTime() - current.getTime());
    };
    scheduleMidnightRefresh();
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    setSelectedAgents((current) => current.filter((agent) => availableAgents.includes(agent)));
  }, [availableAgents]);

  const agentRows = useMemo(() => {
    if (selectedAgents.length === 0) return rows;
    const selected = new Set(selectedAgents);
    return rows.filter((row) => selected.has(row.agentKind ?? 'unknown'));
  }, [rows, selectedAgents]);

  const usage = useMemo(() => {
    if (selectedDate) return agentRows.filter((row) => dayKey(row.lastActivity) === selectedDate);
    const cutoff = new Date(now);
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - (range - 1));
    return agentRows.filter((row) => row.lastActivity.getTime() >= cutoff.getTime());
  }, [agentRows, now, range, selectedDate]);

  const total = useMemo(() => usage.reduce((sum, row) => sum + (row.tokens ?? 0), 0), [usage]);
  const counted = useMemo(() => usage.filter((row) => row.tokens !== null).length, [usage]);
  const missing = usage.length - counted;
  const breakdown = useMemo(() => usage.reduce((sum, row) => {
    if (!row.usageBreakdown) return sum;
    sum.input += row.usageBreakdown.input;
    sum.output += row.usageBreakdown.output;
    sum.cacheRead += row.usageBreakdown.cacheRead;
    sum.cacheWrite += row.usageBreakdown.cacheWrite;
    sum.sessions += 1;
    return sum;
  }, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, sessions: 0 }), [usage]);
  const byKind = useMemo(() => groupRows(usage, (row) => row.agentKind ?? 'unknown'), [usage]);
  const byModel = useMemo(() => groupRows(usage, (row) => row.model), [usage]);
  const byFolder = useMemo(() => groupRows(usage, (row) => folderKeyOf(row)), [usage]);

  const trend = useMemo<UsageTrendDay[]>(() => {
    const scopedDate = selectedDate ? dateFromDayKey(selectedDate) : now;
    const length = selectedDate ? 1 : range;
    const days = Array.from({ length }, (_, index) => {
      const date = new Date(scopedDate);
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - (length - index - 1));
      return { key: dayKey(date), label: `${date.getMonth() + 1}/${date.getDate()}`, tokens: 0, sessions: 0 };
    });
    const byDay = new Map(days.map((day) => [day.key, day]));
    for (const row of usage) {
      const day = byDay.get(dayKey(row.lastActivity));
      if (!day || row.tokens === null) continue;
      day.tokens += row.tokens;
      day.sessions += 1;
    }
    return days;
  }, [now, range, selectedDate, usage]);

  const heatmap = useMemo(() => buildUsageHeatmap(agentRows, now), [agentRows, now]);

  const changeRange = (next: RangeDays) => {
    setRange(next);
    setSelectedDate(null);
    try { localStorage.setItem(RANGE_STORAGE_KEY, String(next)); } catch { /* optional persistence */ }
  };

  const toggleAgent = (agent: string) => {
    setSelectedDate(null);
    setSelectedAgents((current) => {
      const next = current.includes(agent)
        ? current.filter((item) => item !== agent)
        : [...current, agent];
      return availableAgents.length > 1 && next.length === availableAgents.length ? [] : next;
    });
  };

  const toggleDate = (date: string) => {
    setSelectedDate((current) => current === date ? null : date);
  };

  return (
    <main className="usage-scrollbar px-bg-grid h-full min-h-0 overflow-y-auto px-4 py-5 text-zinc-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1500px]">
        <div className="sticky top-0 z-20 -mx-2 mb-5 flex flex-wrap items-center gap-x-4 gap-y-3 border-b border-zinc-800 bg-[#0a0a0d]/95 px-2 py-3 shadow-[0_8px_20px_rgba(0,0,0,0.28)] backdrop-blur">
          <div className="mr-auto min-w-[220px]">
            <h1 className="pixel-font text-[13px] tracking-wide text-zinc-100">AGENT USAGE</h1>
            <p className="mt-1 text-xs text-zinc-600">本机会话累计用量</p>
          </div>
          <div className="usage-scrollbar flex max-w-full shrink-0 items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
            <div aria-label="时间范围" className="flex shrink-0 gap-1">
              {ranges.map((option) => {
                const active = range === option.id && !selectedDate;
                return (
                  <button aria-pressed={active} key={option.id} type="button" onClick={() => changeRange(option.id)} className={`px-btn box-shadow-margin h-7 px-2 pixel-font text-[7px] ${active ? 'px-btn-primary' : 'px-btn-dark'}`}>
                    {option.label}
                  </button>
                );
              })}
            </div>
            {availableAgents.length > 0 ? (
              <div aria-label="Agent 筛选" className="flex shrink-0 gap-1 border-l border-zinc-800 pl-2">
                <button aria-pressed={selectedAgents.length === 0} type="button" onClick={() => { setSelectedAgents([]); setSelectedDate(null); }} className={`px-btn box-shadow-margin h-7 px-2 pixel-font text-[7px] ${selectedAgents.length === 0 ? 'px-btn-primary' : 'px-btn-dark'}`}>ALL</button>
                {availableAgents.map((agent) => {
                  const active = selectedAgents.includes(agent);
                  return (
                    <button aria-pressed={active} key={agent} type="button" onClick={() => toggleAgent(agent)} className={`px-btn box-shadow-margin h-7 px-2 pixel-font text-[7px] ${active ? 'px-btn-primary' : 'px-btn-dark'}`}>
                      {agentLabel(agent)}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        {selectedDate ? (
          <div className="mb-4 flex items-center gap-2 border border-[#294c70] bg-[#101923] px-3 py-2 text-xs text-zinc-400">
            <span>当前日期：<strong className="font-medium text-zinc-100">{dateFromDayKey(selectedDate).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' })}</strong></span>
            <button className="ml-auto text-[10px] text-[#8fc8fa] hover:text-white" type="button" onClick={() => setSelectedDate(null)}>清除日期筛选</button>
          </div>
        ) : null}

        {missing > 0 && (
          <div className="px-card mb-4 flex items-start gap-3 border-l-2 border-l-zinc-500 px-4 py-3">
            <span className="pixel-font shrink-0 text-[9px] text-zinc-300">PARTIAL DATA</span>
            <span className="text-xs text-zinc-500">{missing} 个会话没有可读取的用量记录，不会按 0 计入。</span>
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="累计用量" value={tokens(total)} detail={`${counted} 个会话有记录`} />
          <Metric label="会话覆盖" value={`${counted} / ${usage.length}`} detail={`${missing} 个会话缺少记录`} />
          <Metric label="用量拆分" value={breakdown.sessions > 0 ? `${breakdown.sessions} 个会话` : '未提供'} detail={breakdown.sessions > 0 ? `输入 ${tokens(breakdown.input)} · 输出 ${tokens(breakdown.output)} · 缓存 ${tokens(breakdown.cacheRead + breakdown.cacheWrite)}` : '当前来源没有完整拆分'} />
        </section>

        <UsageTrendChart days={trend} dayScoped={selectedDate != null} selectedDate={selectedDate} onSelectDate={toggleDate} />
        <UsageHeatmapChart now={now} onSelectDate={toggleDate} selectedDate={selectedDate} weeks={heatmap} />

        <section className="mt-4 grid gap-4 lg:grid-cols-3">
          <UsageBreakdownPie title="按 Agent" rows={byKind} variant="donut" eyebrow="AGENT MIX" />
          <UsageBreakdownPie title="按模型" rows={byModel} variant="solid" eyebrow="MODEL SHARE" />
          <UsageBreakdownPie title="按文件夹" rows={byFolder} variant="radial" eyebrow="FOLDER RINGS" />
        </section>
        <SessionList rows={usage} onFocusTask={onFocusTask} />
      </div>
    </main>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="px-card px-4 py-3"><div className="text-[11px] text-zinc-500">{label}</div><div className="mt-2 text-xl font-semibold tabular-nums text-zinc-100">{value}</div><div className="mt-2 text-[11px] text-zinc-600">{detail}</div></div>;
}

function SessionList({ rows, onFocusTask }: { rows: UsageRow[]; onFocusTask: (taskId: string) => void }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'usage' | 'recent'>('usage');
  const sorted = useMemo(() => rows
    .filter((row) => {
      const needle = query.trim().toLowerCase();
      return !needle || [row.name, row.project, row.workingDir, row.model, row.id].some((value) => (value ?? '').toLowerCase().includes(needle));
    })
    .sort((a, b) => sort === 'recent' ? b.lastActivity.getTime() - a.lastActivity.getTime() : (b.tokens ?? -1) - (a.tokens ?? -1)), [query, rows, sort]);
  return (
    <section className="px-card mt-4 overflow-hidden">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-zinc-800 px-4 py-4"><div><h2 className="pixel-font text-[10px] text-zinc-100">SESSION USAGE</h2><p className="mt-2 text-xs text-zinc-600">点击会话定位画板卡片</p></div><span className="px-badge bg-zinc-800 px-2 py-1 text-[8px] text-zinc-300">{sorted.length} / {rows.length}</span></div>
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-800 px-4 py-3"><input aria-label="搜索会话" className="px-input h-7 min-w-[180px] flex-1 px-2 text-xs sm:max-w-xs" placeholder="搜索会话 / 项目 / 模型" value={query} onChange={(event) => setQuery(event.target.value)} /><div className="ml-auto flex gap-1">{([{ key: 'usage', label: 'USAGE' }, { key: 'recent', label: 'RECENT' }] as const).map((item) => <button key={item.key} type="button" onClick={() => setSort(item.key)} className={`px-btn box-shadow-margin h-7 px-2 pixel-font text-[7px] ${sort === item.key ? 'px-btn-primary' : 'px-btn-dark'}`}>{item.label}</button>)}</div></div>
      <div className="hidden grid-cols-[minmax(0,1fr)_minmax(150px,.7fr)_110px] gap-3 border-b border-zinc-800 bg-zinc-950/70 px-4 py-2 text-[8px] text-zinc-600 sm:grid"><span className="pixel-font">SESSION / PROJECT</span><span className="pixel-font">MODEL</span><span className="pixel-font text-right">USAGE</span></div>
      <div className="divide-y divide-zinc-800">{sorted.length === 0 ? <div className="px-4 py-14 text-center text-xs text-zinc-600">没有匹配的会话</div> : sorted.map((row) => <SessionRow key={row.id} row={row} onFocus={() => onFocusTask(row.id)} />)}</div>
    </section>
  );
}

function SessionRow({ row, onFocus }: { row: UsageRow; onFocus: () => void }) {
  return <button type="button" onClick={onFocus} className="group grid w-full gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/60 focus-visible:bg-zinc-800/60 focus-visible:outline-none sm:grid-cols-[minmax(0,1fr)_minmax(150px,.7fr)_110px] sm:items-center"><div className="flex min-w-0 items-start gap-3"><AgentMark kind={row.agentKind} className="mt-0.5 shrink-0" /><div className="min-w-0"><div className="truncate text-[13px] text-zinc-200 group-hover:text-white">{row.name || row.id}</div><div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-zinc-600"><span className="max-w-[180px] truncate">{row.project || row.workingDir || 'unknown'}</span><span className="text-zinc-800">/</span><span className="shrink-0">{formatActivity(row.lastActivity)}</span></div></div></div><div className="flex min-w-0 items-center gap-2 pl-7 sm:pl-0"><ModelMark model={row.model} provider={row.provider} className="min-w-0 truncate text-[11px] text-zinc-500" /></div><div className="flex items-center justify-between gap-3 pl-7 sm:block sm:pl-0 sm:text-right"><div className="tabular-nums text-[13px] text-zinc-100">{row.tokens === null ? '—' : tokens(row.tokens)}</div><div className="mt-1 text-[10px] text-zinc-600">{row.tokens === null ? '无记录' : '会话累计'}</div></div></button>;
}
