import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { TLShapeId, TLUiIconType } from 'tldraw';
import type { Task } from '@/types';
import type { PluginContentRendererProps } from './PluginContentShape';
import type { BoardPluginContentStorage, BoardPluginSettingsStorage } from './storage';
import type { BoardPluginEvent, BoardPluginEventBus } from './events';
import type { BoardAgentStatus } from '@/lib/boardStatus';
import type { BoardResourceContributions } from './resourceTypes';

export type BoardPluginPanelProps = {
  tasks: readonly Task[];
  onFocusTask: (taskId: string) => void;
  contentStorage: BoardPluginContentStorage;
  settingsStorage: BoardPluginSettingsStorage;
};

export type BoardPluginPageProps = {
  tasks: readonly Task[];
  onFocusTask: (taskId: string) => void;
};

export interface BoardPluginPageContribution {
  id: string;
  labelKey: string;
  order?: number;
  Page: ComponentType<BoardPluginPageProps>;
}


export interface BoardPluginContentDecoder {
  decode(value: unknown): unknown | null;
}

export interface BoardPluginContentContribution {
  componentType: string;
  Component: ComponentType<PluginContentRendererProps>;
  codec?: BoardPluginContentDecoder;
  defaultSize?: { w: number; h: number };
}

export interface BoardPluginToolbarContribution {
  id: string;
  labelKey: string;
  icon: TLUiIconType;
  order?: number;
  panelId?: string;
  isActive?: (context: BoardPluginContext) => boolean;
  disabled?: (context: BoardPluginContext) => boolean;
  onClick?: (context: BoardPluginContext) => void | Promise<void>;
}

export interface BoardPluginTopbarContribution extends Omit<BoardPluginToolbarContribution, 'icon'> {
  icon: LucideIcon;
  badge?: (context: BoardPluginContext) => string | number | null;
}

export interface BoardPluginPanelContribution {
  id: string;
  titleKey: string;
  order?: number;
  Panel: ComponentType<BoardPluginPanelProps>;
}

export interface BoardPluginSettingsProps {
  pluginId: string;
  settingsStorage: BoardPluginSettingsStorage;
}

export interface BoardPluginSettingsContribution {
  id: string;
  titleKey: string;
  order?: number;
  Settings: ComponentType<BoardPluginSettingsProps>;
}

export type BoardPluginTranslations = Readonly<Record<string, Readonly<Record<string, unknown>>>>;

export interface BoardPluginOverlayProps {
  context: BoardPluginContext;
  tasks: readonly Task[];
  selectedShapeIds: readonly TLShapeId[];
}

export interface BoardPluginOverlayContribution {
  id: string;
  order?: number;
  Component: ComponentType<BoardPluginOverlayProps>;
}

export type BoardTerminalRuntimePhase =
  | 'loading'
  | 'connecting'
  | 'hydrating'
  | 'ready'
  | 'reconnecting'
  | 'missing'
  | 'exited'
  | 'error';

export interface BoardTerminalOverlayState {
  phase: BoardTerminalRuntimePhase;
  taskStatus?: BoardAgentStatus;
  message?: string;
  exitCode?: number | null;
}

export interface BoardPluginTerminalOverlayProps {
  context: BoardPluginContext;
  terminalId: string;
  title: string;
  cwd: string;
  state: BoardTerminalOverlayState;
}

export interface BoardPluginTerminalOverlayContribution {
  id: string;
  order?: number;
  shouldRender?: (props: BoardPluginTerminalOverlayProps) => boolean;
  Component: ComponentType<BoardPluginTerminalOverlayProps>;
}

export interface BoardPluginCommand {
  id: string;
  labelKey: string;
  execute: (context: BoardPluginContext) => void | Promise<void>;
}

export interface BoardShapeSnapshot {
  id: TLShapeId;
  type: string;
  x: number;
  y: number;
  parentId: string;
  props: Readonly<Record<string, unknown>>;
}

export interface BoardEditorFacade {
  getShape(id: TLShapeId): BoardShapeSnapshot | undefined;
  getSelectedShapeIds(): readonly TLShapeId[];
  focusShape(id: TLShapeId): void;
  focusTask(taskId: string): void;
}

export interface BoardPluginContext {
  pluginId: string;
  editor: BoardEditorFacade;
  tasks: readonly Task[];
  contentStorage: BoardPluginContentStorage;
  settingsStorage: BoardPluginSettingsStorage;
  events: Pick<BoardPluginEventBus, 'subscribe'>;
  notify: {
    info(message: string): void;
    error(message: string): void;
  };
}

export interface BoardPluginSetupContext extends BoardPluginContext {
  subscribe(listener: (event: BoardPluginEvent) => void): () => void;
}

/** 插件只贡献扩展点，不改 Agent 生命周期。 */
export interface BoardPlugin {
  id: string;
  version: string;
  titleKey: string;
  translations?: BoardPluginTranslations;
  toolbar?: readonly BoardPluginToolbarContribution[];
  topbar?: readonly BoardPluginTopbarContribution[];
  pages?: readonly BoardPluginPageContribution[];
  panels?: readonly BoardPluginPanelContribution[];
  settings?: readonly BoardPluginSettingsContribution[];
  overlays?: readonly BoardPluginOverlayContribution[];
  terminalOverlays?: readonly BoardPluginTerminalOverlayContribution[];
  commands?: readonly BoardPluginCommand[];
  content?: readonly BoardPluginContentContribution[];
  resources?: BoardResourceContributions;
  setup?: (context: BoardPluginSetupContext) => void | (() => void);

}
