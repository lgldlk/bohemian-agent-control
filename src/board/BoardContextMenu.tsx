import { createContext, useContext, type ReactNode } from 'react';
import {
  DefaultContextMenu,
  ReorderMenuSubmenu,
  TldrawUiMenuActionItem,
  TldrawUiMenuGroup,
  TldrawUiMenuItem,
  TldrawUiMenuSubmenu,
  useEditor,
  useValue,
  type Editor,
  type TLParentId,
  type TLShape,
  type TLShapeId,
  type TLUiContextMenuProps,
} from 'tldraw';
import { findFrameByGroupId, findTaskShape, groupIdAtPagePoint, isBusinessGroupFrame } from './boardShapes';
import { sessionFromShape, type SessionCopy } from './copySession';
import { classifyBoardContext } from './boardContextMenuModel';
import { arrangeGroupFrame, arrangeWholeBoard } from './boardArrangeEditor';
import { createGroupFromSelection, createEmptyBusinessGroupAtPoint, createNamedGroupFrameAtPoint, expandFrameToChildren, ungroupSelection } from './groupFrameEditor';
import { focusTaskShape as focusTaskShapeOnEditor, readGroupsFromBoard } from './boardSync';
import { getBoardTerminalApi } from './terminalApi';
import type { SpaceGroup } from '@/space/spaceStore';

interface BoardContextActions {
  addAgentAt: (point: { x: number; y: number }, groupId?: string) => void;
  openTerminal: (taskId: string) => void;
}

const BoardContextActionsContext = createContext<BoardContextActions | null>(null);

export function BoardContextActionsProvider({
  children,
  addAgentAt,
  openTerminal,
}: BoardContextActions & { children: ReactNode }) {
  return (
    <BoardContextActionsContext.Provider value={{ addAgentAt, openTerminal }}>
      {children}
    </BoardContextActionsContext.Provider>
  );
}

export function BoardContextMenu(props: TLUiContextMenuProps) {
  return (
    <DefaultContextMenu {...props}>
      <BoardContextMenuContent />
    </DefaultContextMenu>
  );
}

function BoardContextMenuContent() {
  const editor = useEditor();
  useValue('board context selection', () => editor.getSelectedShapeIds().join('|'), [editor]);
  const selected = editor.getSelectedShapes();
  const kind = classifyBoardContext(selected.map((shape) => ({
    type: shape.type,
    meta: shape.meta as Record<string, unknown>,
  })));

  if (kind === 'canvas') return <CanvasMenu editor={editor} />;
  if (kind === 'tasks') return <TaskMenu editor={editor} shapes={selected} />;
  if (kind === 'terminal') return <TerminalMenu editor={editor} shape={selected[0]} />;
  if (kind === 'group') return <GroupMenu editor={editor} frame={selected[0]} />;
  if (kind === 'system-link') return <SystemLinkMenu editor={editor} arrow={selected[0]} />;
  if (kind === 'free-shapes') return <FreeShapeMenu />;
  return <MixedSelectionMenu />;
}

function CanvasMenu({ editor }: { editor: Editor }) {
  const actions = useContext(BoardContextActionsContext);
  const point = () => editor.inputs.getCurrentPagePoint();
  return (
    <>
      <TldrawUiMenuGroup id="board-canvas-create">
        <TldrawUiMenuItem
          id="add-agent"
          label="action.board-add-agent"
          onSelect={() => {
            const target = point();
            actions?.addAgentAt(target, groupIdAtPagePoint(editor, target) ?? undefined);
          }}
        />
        <TldrawUiMenuItem
          id="create-group"
          label="action.board-create-group"
          onSelect={() => {
            createEmptyBusinessGroupAtPoint(editor, point());
          }}
        />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-canvas-clipboard">
        <TldrawUiMenuActionItem actionId="paste" />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-canvas-layout">
        <TldrawUiMenuItem
          id="arrange-board"
          label="action.arrange-board"
          onSelect={() => {
            arrangeWholeBoard(editor);
          }}
        />
      </TldrawUiMenuGroup>
    </>
  );
}

function TaskMenu({ editor, shapes }: { editor: Editor; shapes: TLShape[] }) {
  const actions = useContext(BoardContextActionsContext);
  const taskShapes = shapes.filter((shape) => shape.type === 'task-card');
  const taskIds = taskShapes
    .map((shape) => String((shape.props as { taskId?: string }).taskId ?? ''))
    .filter(Boolean);
  const parentFrames = new Set(taskShapes
    .map((shape) => editor.getShape(shape.parentId))
    .filter((shape): shape is TLShape => Boolean(shape && isBusinessGroupFrame(shape)))
    .map((shape) => shape.id));
  const canUngroup = parentFrames.size > 0;

  return (
    <>
      {taskIds.length === 1 ? (
        <TldrawUiMenuGroup id="board-task-primary">
          <TldrawUiMenuItem
            id="open-terminal"
            label="action.board-open-terminal"
            onSelect={() => actions?.openTerminal(taskIds[0])}
          />
          <TldrawUiMenuActionItem actionId="copy-session" />
        </TldrawUiMenuGroup>
      ) : (
        <CopySessionMenuGroup />
      )}
      <TldrawUiMenuGroup id="board-task-organize">
        <MoveTasksToGroupSubmenu editor={editor} taskShapes={taskShapes} />
        {taskShapes.length >= 2 ? (
          <TldrawUiMenuItem
            id="group-tasks"
            label="action.board-group"
            onSelect={() => {
              createGroupFromSelection(editor);
            }}
          />
        ) : null}
        {canUngroup ? (
          <TldrawUiMenuItem
            id="ungroup-tasks"
            label="action.board-ungroup"
            onSelect={() => {
              ungroupSelection(editor);
            }}
          />
        ) : null}
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-task-danger">
        <TldrawUiMenuItem
          id="remove-task-from-board"
          label={taskIds.length > 1 ? 'action.board-remove-agents' : 'action.board-remove-agent'}
          onSelect={() => {
            editor.deleteShapes(taskShapes.map((shape) => shape.id));
          }}
        />
      </TldrawUiMenuGroup>
    </>
  );
}

function MoveTasksToGroupSubmenu({
  editor,
  taskShapes,
}: {
  editor: Editor;
  taskShapes: TLShape[];
}) {
  const groups = useValue('board frame groups', () => readGroupsFromBoard(editor).map((group) => ({
    ...group,
    collapsed: false,
  })), [editor]);
  if (taskShapes.length === 0 || groups.length === 0) return null;
  const currentGroupIds = new Set(taskShapes.map((shape) => {
    const parent = editor.getShape(shape.parentId);
    return parent && isBusinessGroupFrame(parent)
      ? String((parent.meta as { groupId?: string }).groupId ?? '')
      : 'default';
  }));
  const currentGroupId = currentGroupIds.size === 1 ? [...currentGroupIds][0] : null;

  return (
    <TldrawUiMenuSubmenu id="move-to-group" label="action.board-move-to-group" size="small">
      <TldrawUiMenuGroup id="move-to-group-options">
        {groups.map((group) => (
          <TldrawUiMenuItem
            key={group.id}
            id={`move-to-${group.id}`}
            label={group.name}
            isSelected={currentGroupId === group.id}
            onSelect={() => moveTaskShapesToGroup(editor, taskShapes, group)}
          />
        ))}
      </TldrawUiMenuGroup>
    </TldrawUiMenuSubmenu>
  );
}

function moveTaskShapesToGroup(editor: Editor, taskShapes: TLShape[], group: SpaceGroup) {
  if (taskShapes.length === 0) return;
  let parentId: TLParentId = editor.getCurrentPageId();
  let targetFrameId: TLShapeId | null = null;
  if (group.id !== 'default') {
    let frame = findFrameByGroupId(editor, group.id);
    if (!frame) {
      const bounds = editor.getSelectionPageBounds() ?? editor.getViewportPageBounds();
      const frameId = createNamedGroupFrameAtPoint(editor, group.id, group.name, {
        x: bounds.maxX + 48,
        y: bounds.y,
      });
      frame = editor.getShape(frameId);
    }
    if (frame?.type === 'frame') {
      parentId = frame.id;
      targetFrameId = frame.id;
    }
  }

  editor.markHistoryStoppingPoint('移动到分组');
  editor.reparentShapes(taskShapes.map((shape) => shape.id), parentId);
  if (targetFrameId) expandFrameToChildren(editor, targetFrameId);
}

function TerminalMenu({ editor, shape }: { editor: Editor; shape: TLShape }) {
  if (shape.type !== 'terminal') return null;
  const props = shape.props as { terminalId: string; nodeId: string };
  const api = getBoardTerminalApi();
  const info = api?.info(props.terminalId);
  const nodeId = info?.agentSessionId || info?.nodeId || props.nodeId;
  return (
    <>
      <TldrawUiMenuGroup id="board-terminal-primary">
        {nodeId ? (
          <TldrawUiMenuItem
            id="locate-agent"
            label="action.board-locate-agent"
            onSelect={() => {
              focusTaskShapeOnEditor(editor, nodeId);
            }}
          />
        ) : null}
      </TldrawUiMenuGroup>
      {info?.status === 'exited' || !info ? (
        <TldrawUiMenuGroup id="board-terminal-process">
          {info?.status === 'exited' ? (
            <TldrawUiMenuItem
              id="restart-terminal"
              label="action.board-restart-terminal"
              onSelect={() => {
                void api?.restart(props.terminalId);
              }}
            />
          ) : null}
          {!info ? (
            <TldrawUiMenuItem
              id="recover-terminal"
              label="action.board-recover-terminal"
              onSelect={() => {
                void api?.recoverMissing(shape.id);
              }}
            />
          ) : null}
        </TldrawUiMenuGroup>
      ) : null}
      <CopySessionMenuGroup />
      <TldrawUiMenuGroup id="board-terminal-danger">
        <TldrawUiMenuItem
          id="close-terminal"
          label="action.board-close-terminal"
          onSelect={() => {
            void api?.closeShape(shape.id);
          }}
        />
      </TldrawUiMenuGroup>
    </>
  );
}

function GroupMenu({ editor, frame }: { editor: Editor; frame: TLShape }) {
  if (frame.type !== 'frame') return null;
  const groupId = String((frame.meta as { groupId?: string }).groupId ?? '');
  const actions = useContext(BoardContextActionsContext);
  return (
    <>
      <TldrawUiMenuGroup id="board-group-primary">
        <TldrawUiMenuItem
          id="add-agent-to-group"
          label="action.board-add-agent-group"
          onSelect={() => {
            const point = editor.inputs.getCurrentPagePoint();
            actions?.addAgentAt(point, groupId || undefined);
          }}
        />
        <TldrawUiMenuItem
          id="arrange-group"
          label="action.arrange-group"
          onSelect={() => {
            arrangeGroupFrame(editor, frame.id);
          }}
        />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-group-manage">
        <TldrawUiMenuItem
          id="rename-group"
          label="action.board-rename-group"
          onSelect={() => {
            editor.select(frame.id);
            editor.setEditingShape(frame.id);
          }}
        />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-group-danger">
        <TldrawUiMenuItem
          id="dissolve-group"
          label="action.board-dissolve-group"
          onSelect={() => {
            editor.select(frame.id);
            ungroupSelection(editor);
          }}
        />
      </TldrawUiMenuGroup>
    </>
  );
}

function SystemLinkMenu({ editor, arrow }: { editor: Editor; arrow: TLShape }) {
  const meta = arrow.meta as { fromShapeId?: string; toShapeId?: string };
  const focusShape = (id?: string) => {
    if (!id) return;
    const shape = editor.getShape(id as TLShapeId);
    if (!shape) return;
    editor.select(shape.id);
    editor.zoomToSelection({ animation: { duration: 220 } });
  };
  return (
    <>
      <TldrawUiMenuGroup id="board-link-locate">
        <TldrawUiMenuItem
          id="locate-link-source"
          label="action.board-locate-link-source"
          disabled={!meta.fromShapeId}
          onSelect={() => focusShape(meta.fromShapeId)}
        />
        <TldrawUiMenuItem
          id="locate-link-target"
          label="action.board-locate-link-target"
          disabled={!meta.toShapeId}
          onSelect={() => focusShape(meta.toShapeId)}
        />
      </TldrawUiMenuGroup>

    </>
  );
}

function FreeShapeMenu() {
  return (
    <>
      <TldrawUiMenuGroup id="board-free-clipboard">
        <TldrawUiMenuActionItem actionId="copy" />
        <TldrawUiMenuActionItem actionId="duplicate" />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-free-layout">
        <ReorderMenuSubmenu />
        <TldrawUiMenuActionItem actionId="toggle-lock" />
      </TldrawUiMenuGroup>
      <TldrawUiMenuGroup id="board-free-danger">
        <TldrawUiMenuActionItem actionId="delete" />
      </TldrawUiMenuGroup>
    </>
  );
}

function MixedSelectionMenu() {
  return (
    <>
      <CopySessionMenuGroup />
      <TldrawUiMenuGroup id="board-mixed-safe">
        <TldrawUiMenuActionItem actionId="zoom-to-selection" />
      </TldrawUiMenuGroup>
    </>
  );
}

function CopySessionMenuGroup() {
  const editor = useEditor();
  const visible = useValue('copy-session-visible', () => selectedSessions(editor).length > 0, [editor]);
  if (!visible) return null;
  return (
    <TldrawUiMenuGroup id="copy-session">
      <TldrawUiMenuActionItem actionId="copy-session" />
    </TldrawUiMenuGroup>
  );
}

export function selectedSessions(editor: Editor): SessionCopy[] {
  const byId = new Map<string, SessionCopy>();
  for (const shape of editor.getSelectedShapes()) {
    const session = sessionFromShape(shape as { type: string; props: Record<string, unknown> });
    if (!session) continue;
    const existing = byId.get(session.id);
    if (!existing || (!existing.agentKind && session.agentKind)) byId.set(session.id, session);
  }
  for (const session of byId.values()) {
    if (session.agentKind) continue;
    const cardId = findTaskShape(editor, session.id);
    const card = cardId ? editor.getShape(cardId) : undefined;
    if (card?.type !== 'task-card') continue;
    const kind = (card.props as { agentKind?: string }).agentKind;
    if (kind) session.agentKind = kind;
  }
  return [...byId.values()];
}
