import { useEffect, useState } from 'react';
import {
  AssetToolbarItem,
  CheckBoxToolbarItem,
  CloudToolbarItem,
  DEFAULT_THEME,
  DefaultStylePanel,
  DefaultToolbar,
  DiamondToolbarItem,
  DrawToolbarItem,
  EllipseToolbarItem,
  EraserToolbarItem,
  FrameToolbarItem,
  HandToolbarItem,
  HeartToolbarItem,
  HexagonToolbarItem,
  HighlightToolbarItem,
  LaserToolbarItem,
  LineToolbarItem,
  NoteToolbarItem,
  OvalToolbarItem,
  RectangleToolbarItem,
  RhombusToolbarItem,
  SelectToolbarItem,
  StarToolbarItem,
  TextToolbarItem,
  Tldraw,
  TldrawUiButtonIcon,
  TldrawUiDropdownMenuContent,
  TldrawUiDropdownMenuGroup,
  TldrawUiDropdownMenuRoot,
  TldrawUiDropdownMenuTrigger,
  TldrawUiMenuContextProvider,
  TldrawUiMenuItem,
  TldrawUiPopover,
  TldrawUiPopoverContent,
  TldrawUiPopoverTrigger,
  TldrawUiToolbar,
  TldrawUiToolbarButton,
  TriangleToolbarItem,
  useEditor,
  useValue,
  XBoxToolbarItem,
  type Editor,
  type TLThemes,
  type TLUiOverrides,
} from 'tldraw';
import { History, SlidersHorizontal } from 'lucide-react';
import { createDebouncedTask } from '@/lib/timing';
import { TerminalHistoryPanel } from '@bohemian/terminal-ui/history-panel';
import { BoardContextActionsProvider, BoardContextMenu, selectedSessions } from './BoardContextMenu';
import { formatSessionCopy } from './copySession';
import { getBoardTerminalApi } from './terminalApi';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import type { Task } from '@/types';
import type { TerminalClient } from '@bohemian/terminal-client';
import { TaskCardShapeUtil } from './TaskCardShape';
import { TerminalShapeUtil } from './TerminalShape';
import { ResourceShapeUtil } from './ResourceShape';
import { importDroppedFilesToBoard } from './resourceDrop';
import { getBoardEditor, setBoardEditor } from './boardEditor';
import { createEmptyBusinessGroupAtPoint, createGroupFromSelection, ungroupSelection } from './groupFrameEditor';
import { listenBoardGroups } from './groupSync';
import { useBoardCanvasEvents } from './events';
import { bindScreenSizedGroupTitles } from './groupFrameTitle';
import { arrangeGroupFrame, arrangeWholeBoard } from './boardArrangeEditor';
import { BoardPluginOverlayHost } from './plugins/hosts/BoardPluginOverlayHost';
import { BoardPluginPageOverlayHost, BoardPluginPanel } from './plugins/hosts/BoardPluginPanelHost';
import { BoardPluginToolbarButtons } from './plugins/hosts/BoardPluginToolbarHost';
import { BoardPluginRuntimeProvider } from './plugins/runtimeScope';
import { BoardPluginRuntimeCore } from './plugins/runtimeCore';
import { PluginContentShapeUtil } from './plugins/PluginContentShape';
import AgentQuickNavigator from './AgentQuickNavigator';
import { useBoardWorkspaceStore } from './boardWorkspaceStore';
import { ResourceActivationRuntime } from './ResourceActivationRuntime';
import { isBusinessGroupFrame } from './boardShapes';
import { FRAME_DEFAULT_H, FRAME_DEFAULT_W } from './groupFrame';
import { GroupActionBar, PixelGrid } from './BoardCanvasDecorations';
import { BoardPageBridge, BoardPluginRuntimeBridge, BoardTerminalRuntime } from './BoardRuntimeBridges';

interface EvidenceBoardProps {
  tasks?: Task[];
  /** Every known Agent, used for per-board counts that include hidden boards. */
  allTasks?: Task[];
  changedIds?: string[];
  search?: string;
  terminalClient: TerminalClient;
  onOpenTerminal: (taskId: string) => void;
  onDropNewTask: (taskId: string, x: number, y: number) => void;
  onBlankDoubleClick?: (x: number, y: number, groupId?: string) => void;
}

/** 白板文档(卡片坐标 / frame / 连线 / 相机)存在浏览器 IndexedDB,刷新不丢 */
export const BOARD_PERSIST_KEY = 'bohemian-agent-control:board:v1';

const BOARD_SHAPE_UTILS = [TaskCardShapeUtil, TerminalShapeUtil, ResourceShapeUtil, PluginContentShapeUtil];

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

function CanvasOverlays({
  tasks,
  client,
  search,
  stylePanelOpen,
  onToggleStylePanel,
  onOpenTerminal,
  pluginRuntime,
}: {
  tasks: readonly Task[];
  client: TerminalClient;
  search?: string;
  stylePanelOpen: boolean;
  onToggleStylePanel: () => void;
  onOpenTerminal: (taskId: string) => void;
  pluginRuntime: BoardPluginRuntimeCore;
}) {
  const [historyOpen, setHistoryOpen] = useState(false);
  return (
    <>
      <AgentQuickNavigator tasks={tasks} onOpenTerminal={onOpenTerminal} />
      <BoardPluginPageOverlayHost tasks={tasks} />
      <BoardPluginPanel tasks={tasks} />
      <BoardPluginOverlayHost tasks={tasks} />
      <BoardPluginRuntimeBridge tasks={tasks} runtime={pluginRuntime} />
      <BoardPageBridge />
      <ResourceActivationRuntime />
      <BoardTerminalRuntime client={client} />
      <BoardSearch query={search ?? ''} />
      <GroupActionBar />
      <div className="fixed bottom-3 right-3 z-[160000] flex items-center gap-1 border border-zinc-700 bg-zinc-950 p-1 shadow-xl">
        <button
          type="button"
          title="Toggle style panel"
          aria-label="Toggle style panel"
          aria-pressed={stylePanelOpen}
          onClick={onToggleStylePanel}
          className={`flex h-8 w-8 items-center justify-center ${stylePanelOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400'} hover:bg-zinc-800 hover:text-white`}
        >
          <SlidersHorizontal size={15} />
        </button>
        <button
          type="button"
          title="Search command history"
          aria-label="Search command history"
          onClick={() => setHistoryOpen((open) => !open)}
          className={`flex h-8 w-8 items-center justify-center ${historyOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400'} hover:bg-zinc-800 hover:text-white`}
        >
          <History size={15} />
        </button>
      </div>
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
  useEffect(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return;
    const search = createDebouncedTask(200);
    search.schedule(() => {
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
    });
    return () => search.cancel();
  }, [editor, query]);
  return null;
}

function ArrangeToolbarMenu() {
  const editor = useEditor();
  const { t } = useTranslation();
  const frameId = useValue(
    'arrange-frame',
    () => {
      const frames = editor.getSelectedShapes().filter((shape) => isBusinessGroupFrame(shape));
      return frames.length === 1 ? frames[0].id : null;
    },
    [editor],
  );

  return (
    <TldrawUiDropdownMenuRoot id="board-arrange-menu">
      <TldrawUiDropdownMenuTrigger>
        <TldrawUiToolbarButton type="tool" title={t('board.arrangeMenu')}>
          <TldrawUiButtonIcon icon="distribute-horizontal" />
        </TldrawUiToolbarButton>
      </TldrawUiDropdownMenuTrigger>
      <TldrawUiDropdownMenuContent side="top" align="center">
        <TldrawUiMenuContextProvider type="menu" sourceId="toolbar">
          <TldrawUiDropdownMenuGroup>
            <TldrawUiMenuItem
              id="arrange-board"
              label="action.arrange-board"
              iconLeft="distribute-horizontal"
              onSelect={() => {
                arrangeWholeBoard(editor);
              }}
            />
            <TldrawUiMenuItem
              id="arrange-group"
              label="action.arrange-group"
              iconLeft="tool-frame"
              disabled={!frameId}
              onSelect={() => {
                if (frameId) arrangeGroupFrame(editor, frameId);
              }}
            />
          </TldrawUiDropdownMenuGroup>
        </TldrawUiMenuContextProvider>
      </TldrawUiDropdownMenuContent>
    </TldrawUiDropdownMenuRoot>
  );
}

function MoreToolsMenu() {
  const editor = useEditor();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const close = () => {
    setOpen(false);
    editor.menus.deleteOpenMenu('board-more-tools');
  };

  return (
    <TldrawUiPopover id="board-more-tools" open={open} onOpenChange={setOpen}>
      <TldrawUiPopoverTrigger>
        <TldrawUiToolbarButton type="tool" title={t('board.moreTools')}>
          <TldrawUiButtonIcon icon="dots-horizontal" />
        </TldrawUiToolbarButton>
      </TldrawUiPopoverTrigger>
      <TldrawUiPopoverContent side="top" align="center">
        <TldrawUiToolbar
          label={t('board.moreTools')}
          orientation="grid"
          className="tl-board-more-tools"
          onClick={close}
        >
          <TldrawUiMenuContextProvider type="toolbar-overflow" sourceId="toolbar">
            <DrawToolbarItem />
            <EraserToolbarItem />
            <AssetToolbarItem />
            <LineToolbarItem />
            <HighlightToolbarItem />
            <FrameToolbarItem />
            <RectangleToolbarItem />
            <EllipseToolbarItem />
            <TriangleToolbarItem />
            <DiamondToolbarItem />
            <HexagonToolbarItem />
            <OvalToolbarItem />
            <RhombusToolbarItem />
            <StarToolbarItem />
            <CloudToolbarItem />
            <HeartToolbarItem />
            <XBoxToolbarItem />
            <CheckBoxToolbarItem />
            <LaserToolbarItem />
          </TldrawUiMenuContextProvider>
        </TldrawUiToolbar>
      </TldrawUiPopoverContent>
    </TldrawUiPopover>
  );
}

function BusinessGroupToolbarButton() {
  const editor = useEditor();
  const { t } = useTranslation();
  const selectedTaskCount = useValue(
    'business-group-selection',
    () => editor.getSelectedShapes().filter((shape) => shape.type === 'task-card').length,
    [editor],
  );

  const createGroup = () => {
    if (selectedTaskCount > 0) {
      createGroupFromSelection(editor);
      return;
    }
    const viewport = editor.getViewportPageBounds();
    createEmptyBusinessGroupAtPoint(editor, {
      x: viewport.x + (viewport.w - FRAME_DEFAULT_W) / 2,
      y: viewport.y + (viewport.h - FRAME_DEFAULT_H) / 2,
    });
  };

  return (
    <TldrawUiToolbarButton
      type="tool"
      title={selectedTaskCount > 0 ? t('board.groupSelection') : t('board.createGroup')}
      onClick={createGroup}
    >
      <TldrawUiButtonIcon icon="group" />
    </TldrawUiToolbarButton>
  );
}

function BoardToolbar() {
  return (
    <DefaultToolbar minItems={20} maxItems={20}>
      <SelectToolbarItem />
      <HandToolbarItem />
      <TextToolbarItem />
      <NoteToolbarItem />
      <BusinessGroupToolbarButton />
      <ArrangeToolbarMenu />
      <MoreToolsMenu />
      <BoardPluginToolbarButtons />
    </DefaultToolbar>
  );
}

const BOARD_COMPONENTS = {
  Grid: PixelGrid,
  LoadingScreen: BoardLoadingScreen,
  ContextMenu: BoardContextMenu,
  MenuPanel: null,
  Toolbar: BoardToolbar,
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
      'action.arrange-board': 'Arrange board',
      'action.arrange-group': 'Arrange selected group',
      'action.board-add-agent': 'Add Agent here',
      'action.board-create-group': 'Create group here',
      'action.board-open-terminal': 'Open or focus terminal',
      'action.board-locate-agent': 'Locate Agent card',
      'action.board-restart-terminal': 'Restart terminal',
      'action.board-recover-terminal': 'Recover terminal',
      'action.board-close-terminal': 'Close and remove terminal',
      'action.board-move-to-group': 'Move to group',
      'action.board-group': 'Group selected Agents',
      'action.board-ungroup': 'Move out of group',
      'action.board-remove-agent': 'Remove Agent from board',
      'action.board-remove-agents': 'Remove selected Agents from board',
      'action.board-add-agent-group': 'Add Agent to this group',
      'action.board-rename-group': 'Rename group',
      'action.board-dissolve-group': 'Dissolve group, keep contents',
      'action.board-locate-link-source': 'Locate link source',
      'action.board-locate-link-target': 'Locate link target',
    },
    'zh-cn': {
      'action.group': '编成一组',
      'action.ungroup': '移出分组',
      'action.copy-session': '复制会话',
      'action.copy-session.copied': '已复制会话',
      'action.copy-session.failed': '复制会话失败',
      'action.arrange-board': '整理整个画板',
      'action.arrange-group': '整理选中的组',
      'action.board-add-agent': '在这里添加 Agent',
      'action.board-create-group': '在这里新建分组',
      'action.board-open-terminal': '打开或聚焦终端',
      'action.board-locate-agent': '定位关联 Agent',
      'action.board-restart-terminal': '重新启动终端',
      'action.board-recover-terminal': '恢复终端',
      'action.board-close-terminal': '关闭并移除终端',
      'action.board-move-to-group': '移动到分组',
      'action.board-group': '编组选中的 Agent',
      'action.board-ungroup': '移出当前分组',
      'action.board-remove-agent': '从画板移除 Agent',
      'action.board-remove-agents': '从画板移除所选 Agent',
      'action.board-add-agent-group': '添加 Agent 到这个组',
      'action.board-rename-group': '重命名分组',
      'action.board-dissolve-group': '解散分组，保留内容',
      'action.board-locate-link-source': '定位连线起点',
      'action.board-locate-link-target': '定位连线终点',
    },
  },
};

/**
 * 警匪片无限白板(tldraw):
 * - 任务卡片 = 自定义 task-card shape(深色)
 * - 分组 = tldraw frame(按 spaceStore 分组自动套框,标题为组名)
 * - 框选/缩放/撤销/连线箭头全用 tldraw 自带
 * - 左栏「＋ 添加会话」/ 拖拽进来 → 落到白板
 * - 数据同步由外部的 useBoardSync hook 处理
 */
export default function EvidenceBoard({
  tasks = [],
  allTasks = [],
  search,
  terminalClient,
  onOpenTerminal,
  onDropNewTask,
  onBlankDoubleClick,
}: EvidenceBoardProps) {
  const { t } = useTranslation();
  const { editorRef, dropRef, fileDropState } = useBoardCanvasEvents({
    onOpenTerminal,
    onDropNewTask,
    onDropFiles: importDroppedFilesToBoard,
    onBlankDoubleClick,
  });

  const [stylePanelOpen, setStylePanelOpen] = useState(false);
  const [pluginRuntime] = useState(() => new BoardPluginRuntimeCore());

  useEffect(() => {
    const root = dropRef.current;
    if (!root) return;
    return bindScreenSizedGroupTitles(root);
  }, [dropRef]);

  return (
    <div ref={dropRef} className="tldraw-dark-host relative h-full w-full">
      <BoardPluginRuntimeProvider runtime={pluginRuntime}>
        <BoardContextActionsProvider
          addAgentAt={(point, groupId) => onBlankDoubleClick?.(point.x, point.y, groupId)}
          openTerminal={onOpenTerminal}
        >
        <Tldraw
        persistenceKey={BOARD_PERSIST_KEY}
        shapeUtils={BOARD_SHAPE_UTILS}
        components={{
          ...BOARD_COMPONENTS,
          StylePanel: stylePanelOpen ? DefaultStylePanel : null,
          InFrontOfTheCanvas: () => (
            <CanvasOverlays
              tasks={tasks}
              client={terminalClient}
              search={search}
              stylePanelOpen={stylePanelOpen}
              onToggleStylePanel={() => setStylePanelOpen((open) => !open)}
              onOpenTerminal={onOpenTerminal}
              pluginRuntime={pluginRuntime}
            />
          ),
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
          setBoardEditor(editor);
          const store = useBoardWorkspaceStore.getState();
  const activeBoardId = store.activeBoardId;
  const stopGroups = listenBoardGroups(editor, activeBoardId);
          return () => {
            stopGroups();
            if (getBoardEditor() === editor) setBoardEditor(null);
          };
        }}
          />
        </BoardContextActionsProvider>
      </BoardPluginRuntimeProvider>
      {fileDropState.phase !== 'idle' && (
        <div className="pointer-events-none absolute inset-0 z-[210000] flex items-center justify-center bg-black/55 backdrop-blur-[1px]">
          <div className="border border-zinc-500 bg-zinc-950 px-6 py-5 text-center shadow-2xl">
            <div className="pixel-font text-[10px] text-zinc-100">
              {fileDropState.phase === 'importing'
                ? t('board.importingFiles', { count: fileDropState.count })
                : t('board.dropFiles', { count: fileDropState.count || 1 })}
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">{t('board.dropFilesHint')}</div>
          </div>
        </div>
      )}
    </div>
  );
}
