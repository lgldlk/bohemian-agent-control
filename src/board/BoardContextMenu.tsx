import {
  DefaultContextMenu,
  DefaultContextMenuContent,
  TldrawUiMenuActionItem,
  TldrawUiMenuGroup,
  useEditor,
  useValue,
  type Editor,
  type TLUiContextMenuProps,
} from 'tldraw';
import { findTaskShape } from './boardSync';
import { sessionFromShape, type SessionCopy } from './copySession';

export function BoardContextMenu(props: TLUiContextMenuProps) {
  return (
    <DefaultContextMenu {...props}>
      <CopySessionMenuGroup />
      <DefaultContextMenuContent />
    </DefaultContextMenu>
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
