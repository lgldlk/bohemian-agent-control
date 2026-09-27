import { useEffect, useId, useRef, useState } from 'react';
import {
  DEFAULT_THEME,
  Tldraw,
  useEditor,
  type Editor,
  type TLGridProps,
  type TLThemes,
  type TLUiOverrides,
} from 'tldraw';
import { History } from 'lucide-react';
import { TerminalHistoryPanel } from '@bohemian/terminal-ui/history-panel';
import { BoardContextMenu, selectedSessions } from './BoardContextMenu';
import { formatSessionCopy } from './copySession';
import { getBoardTerminalApi } from './boardTerminals';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import type { Task } from '@/types';
import type { TerminalClient } from '@bohemian/terminal-client';
import { TaskCardShapeUtil, taskToCardProps } from './TaskCardShape';
import { TerminalShapeUtil } from './TerminalShape';
import { useBoardTerminals } from './useBoardTerminals';
import {
  createGroupFromSelection,
  expandFrameToChildren,
  focusTaskShape as focusShape,
  readGroupsFromBoard,
  setBoardSpaceSyncReady,
  isBoardSpaceSyncReady,
  ungroupSelection,
} from './boardSync';
import { createShapeId as makeShapeId, type TLParentId, type TLShapeId } from 'tldraw';
import { useSpaceStore } from '@/space/spaceStore';
import { useBoardCanvasEvents, useBoardNodeCascade, useGroupActionEvents } from './events';

interface EvidenceBoardProps {
  tasks?: Task[];
  changedIds?: string[];
  search?: string;
  terminalClient: TerminalClient;
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}

/** 白板文档(卡片坐标 / frame / 连线 / 相机)存在浏览器 IndexedDB,刷新不丢 */
export const BOARD_PERSIST_KEY = 'bohemian-agent-control:board:v1';

const BOARD_SHAPE_UTILS = [TaskCardShapeUtil, TerminalShapeUtil];

/** 节点选中描边画在 canvas overlay 上,必须走 theme,CSS 盖不住 */
const BOARD_THEMES: Partial<TLThemes> = {
  default: {
    ...DEFAULT_THEME,
    colors: {
      light: {
        ...DEFAULT_THEME.colors.light,
        selectionStroke: '#09090b',
        selectionFill: 'rgba(9, 9, 11, 0.08)',
        selectedContrast: '#fafafa',
      },
      dark: {
        ...DEFAULT_THEME.colors.dark,
        selectionStroke: '#fafafa',
        selectionFill: 'rgba(250, 250, 250, 0.12)',
        selectedContrast: '#09090b',
      },
    },
  },
};

function BoardLoadingScreen() {
  return (
    <div className="tl-board-loading">
      <div className="tl-board-loading__bricks">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="tl-board-loading__brick" style={{ animationDelay: `${i * 0.12}s` }} />
        ))}
      </div>
      <div className="tl-board-loading__label">
        LOADING<span className="px-blink">_</span>
      </div>
    </div>
  );
}

function CanvasOverlays({ client, search }: { client: TerminalClient; search?: string }) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
      <BoardTerminalRuntime client={client} />
      <BoardSearch query={search ?? ''} />
      <GroupActionBar />
      <button
        type="button"
        title="Search command history"
        aria-label="Search command history"
        onClick={() => setHistoryOpen((open) => !open)}
        className={`fixed bottom-3 right-3 z-[160000] flex h-8 w-8 items-center justify-center border border-zinc-700 bg-zinc-950 shadow-xl ${historyOpen ? 'text-white' : 'text-zinc-400'} hover:bg-zinc-800 hover:text-white`}
      >
        <History size={15} />
      </button>
      {historyOpen && (
        <TerminalHistoryPanel
          client={client}
          onClose={() => setHistoryOpen(false)}
          onOpen={(terminalId) => {
            getBoardTerminalApi()?.focusTerminal(terminalId);
            setHistoryOpen(false);
          }}
        />
      )}
    </>
  );
}

function BoardSearch({ query }: { query: string }) {
  const editor = useEditor();
  const timer = useRef<number | null>(null);
  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      const ids = editor.getCurrentPageShapes()
        .filter((shape) => {
          if (shape.type !== 'task-card') return false;
          const props = shape.props as { name?: string; project?: string; model?: string; taskId?: string };
          return [props.name, props.project, props.model, props.taskId].some((value) =>
            (value ?? '').toLowerCase().includes(needle),
          );
        })
        .map((shape) => shape.id);
      if (!ids.length) return;
      editor.setSelectedShapes(ids);
      editor.zoomToSelection({ animation: { duration: 220 } });
    }, 200);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [editor, query]);
  return null;
}

function BoardTerminalRuntime({ client }: { client: TerminalClient }) {
  const editor = useEditor();
  useBoardTerminals(client, editor);
  useBoardNodeCascade(editor);
  return null;
}

const BOARD_COMPONENTS = {
  Grid: PixelGrid,
  LoadingScreen: BoardLoadingScreen,
  ContextMenu: BoardContextMenu,
};

const BOARD_OVERRIDES: TLUiOverrides = {
  actions(editor, actions, helpers) {
    const origGroup = actions.group?.onSelect;
    const origUngroup = actions.ungroup?.onSelect;
    return {
      ...actions,
      group: {
        ...actions.group,
        onSelect: (source) => {
          if (createGroupFromSelection(editor)) return;
          origGroup?.(source);
        },
      },
      ungroup: {
        ...actions.ungroup,
        onSelect: (source) => {
          if (ungroupSelection(editor)) return;
          origUngroup?.(source);
        },
      },
      'copy-session': {
        id: 'copy-session',
        label: 'action.copy-session',
        readonlyOk: true,
        async onSelect() {
          const text = formatSessionCopy(selectedSessions(editor));
          if (!text) return;
          try {
            await navigator.clipboard.writeText(text);
            helpers.addToast({
              title: helpers.msg('action.copy-session.copied'),
              description: text,
              severity: 'success',
            });
          } catch {
            helpers.addToast({
              title: helpers.msg('action.copy-session.failed'),
              severity: 'error',
            });
          }
        },
      },
    };
  },
  translations: {
    en: {
      'action.group': 'Group',
      'action.ungroup': 'Ungroup',
      'action.copy-session': 'Copy session',
      'action.copy-session.copied': 'Session copied',
      'action.copy-session.failed': 'Could not copy session',
    },
    'zh-cn': {
      'action.group': '编成一组',
      'action.ungroup': '移出分组',
      'action.copy-session': '复制会话',
      'action.copy-session.copied': '已复制会话',
      'action.copy-session.failed': '复制会话失败',
    },
  },
};

/** 选中任务卡后出现:编成一组 / 移出分组。框选本身不建组。 */
function GroupActionBar() {
  const { t } = useTranslation();
  const { visible, canGroup, canUngroup, group, ungroup, isolate } = useGroupActionEvents();
  if (!visible) return null;

  return (
    <div className="tl-group-bar" onPointerDown={isolate}>
      {canGroup && (
        <button
          type="button"
          className="px-btn px-btn-primary box-shadow-margin h-8 px-3 pixel-font text-[8px]"
          onClick={group}
        >
          GROUP
        </button>
      )}
      {canUngroup && (
        <button
          type="button"
          className="px-btn px-btn-dark box-shadow-margin h-8 px-3 pixel-font text-[8px]"
          onClick={ungroup}
        >
          UNGROUP
        </button>
      )}
      <span className="tl-group-bar__hint">
        {canGroup ? t('board.groupHint') : t('board.ungroupHint')}
      </span>
    </div>
  );
}

/** PixelAct 线网格:随相机平移/缩放,细线+每 4 格一条稍亮的主线 */
function PixelGrid({ x, y, z, size }: TLGridProps) {
  const editor = useEditor();
  const rawId = useId().replace(/:/g, '');
  const steps = editor.options.gridSteps;
  return (
    <svg className="tl-grid" aria-hidden="true">
      <defs>
        {steps.map(({ min, mid, step }, i) => {
          const s = step * size * z;
          if (s < 4) return null;
          const xo = (((x * z) % s) + s) % s;
          const yo = (((y * z) % s) + s) % s;
          const t = z < mid ? Math.max(0, (z - min) / Math.max(mid - min, 0.001)) : 1;
          const isMajor = step >= 4;
          const alpha = (isMajor ? 0.08 : 0.035) * t;
          return (
            <pattern
              key={i}
              id={`${rawId}-${step}`}
              width={s}
              height={s}
              patternUnits="userSpaceOnUse"
              x={xo}
              y={yo}
            >
              <path
                d={`M ${s} 0 L 0 0 0 ${s}`}
                fill="none"
                stroke={`rgba(244,244,245,${alpha})`}
                strokeWidth={0.5}
              />
            </pattern>
          );
        })}
      </defs>
      {steps.map(({ step }, i) => (
        <rect key={i} width="100%" height="100%" fill={`url(#${rawId}-${step})`} />
      ))}
    </svg>
  );
}

/**
 * 警匪片无限白板(tldraw):
 * - 任务卡片 = 自定义 task-card shape(深色)
 * - 分组 = tldraw frame(按 spaceStore 分组自动套框,标题为组名)
 * - 框选/缩放/撤销/连线箭头全用 tldraw 自带
 * - 左栏「＋ 添加会话」/ 拖拽进来 → 落到白板
 * - 数据同步由外部的 useBoardSync hook 处理
 */
export default function EvidenceBoard({
  search,
  terminalClient,
  onOpenTerminal,
  onDropNewTask,
  onBlankDoubleClick,
}: EvidenceBoardProps) {
  const { editorRef, dropRef } = useBoardCanvasEvents({
    onOpenTerminal,
    onDropNewTask,
    onBlankDoubleClick,
  });

  return (
    <div ref={dropRef} className="tldraw-dark-host h-full w-full">
      <Tldraw
        persistenceKey={BOARD_PERSIST_KEY}
        shapeUtils={BOARD_SHAPE_UTILS}
        components={{
          ...BOARD_COMPONENTS,
          InFrontOfTheCanvas: () => <CanvasOverlays client={terminalClient} search={search} />,
        }}
        overrides={BOARD_OVERRIDES}
        themes={BOARD_THEMES}
        colorScheme="dark"
        options={{ createTextOnCanvasDoubleClick: false }}
        onMount={(editor) => {
          editorRef.current = editor;
          editor.user.updateUserPreferences({
            colorScheme: 'dark',
            locale: i18n.language.startsWith('zh') ? 'zh-cn' : 'en',
          });
          i18n.on('languageChanged', (lng) => {
            editor.user.updateUserPreferences({
              locale: lng.startsWith('zh') ? 'zh-cn' : 'en',
            });
          });
          editor.updateInstanceState({ isGridMode: true });
          editor.updateDocumentSettings({ gridSize: 8 });
          (window as unknown as { __boardEditor?: Editor }).__boardEditor = editor;
          let syncFrame = 0;
          const syncStore = () => {
            if (syncFrame) return;
            syncFrame = requestAnimationFrame(() => {
              syncFrame = 0;
              const next = readGroupsFromBoard(editor).map((g) => ({
                ...g,
                collapsed: false,
              }));
              useSpaceStore.getState().replaceGroups(next);
            });
          };
          setBoardSpaceSyncReady(false);
          editor.store.listen(() => {
            if (!isBoardSpaceSyncReady()) return;
            syncStore();
          }, { scope: 'document' });
        }}
      />
    </div>
  );
}



/** 给 boardSync 用的 editor 句柄(白板唯一实例) */
export function getBoardEditor(): Editor | null {
  return (window as unknown as { __boardEditor?: Editor | null }).__boardEditor ?? null;
}

export function focusTaskShape(taskId: string) {
  const editor = getBoardEditor();
  if (!editor) return;
  focusShape(editor, taskId);
}

export function createTaskCardShape(
  taskId: string,
  x: number,
  y: number,
  task?: Task,
  parentId?: TLParentId
) {
  const editor = getBoardEditor();
  if (!editor) return;
  editor.createShapes([
    {
      id: makeShapeId(),
      type: 'task-card',
      x,
      y,
      ...(parentId ? { parentId } : {}),
      props: taskToCardProps(task, taskId),
    },
  ]);
  if (parentId) expandFrameToChildren(editor, parentId as TLShapeId);
}
