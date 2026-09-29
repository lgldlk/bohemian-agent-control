import { useLayoutEffect, useState, type MouseEvent } from 'react';
import { HTMLContainer, Rectangle2d, ShapeUtil, T, createShapePropsMigrationIds, createShapePropsMigrationSequence, resizeBox, useEditor, type IndexKey, type JsonObject, type TLResizeInfo, type TLShapeId, type TLParentId } from 'tldraw';
import { SquareTerminal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Task } from '@/types';
import AgentMark from '@/components/AgentMark';
import BloubStatusIcon from '@/components/BloubStatusIcon';
import ModelMark from '@/components/ModelMark';
import { handleShapeDoubleClick, useTaskCardEvents } from './events';
import { useAgentPhase } from '@/board/useAgentPhase';
import { isRunningPhase } from '@/lib/boardStatus';
import StatusLamps from '@/components/StatusLamps';
import TokenCount from '@/components/TokenCount';
import '@/styles/pixel.css';

const TASK_CARD_TYPE = 'task-card' as const;
export const TASK_CARD_W = 320;
export const TASK_CARD_H = 112;
export const TASK_CARD_RADIUS = 14;
const TASK_CARD_ICON = 68;

export type TaskCardShapeProps = {
  taskId: string;
  w: number;
  h: number;
  name: string;
  status: string;
  project: string;
  model: string;
  provider: string;
  agentKind: string;
  customTitle: string;
  messageCount: number;
  tokenCount: number;
  lastActivity: number;
};

declare module 'tldraw' {
  export interface TLGlobalShapePropsMap {
    'task-card': TaskCardShapeProps;
  }
}

export type TaskCardShape = {
  id: TLShapeId;
  type: 'task-card';
  typeName: 'shape';
  x: number;
  y: number;
  rotation: number;
  index: IndexKey;
  parentId: TLParentId;
  isLocked: boolean;
  opacity: number;
  props: TaskCardShapeProps;
  meta: JsonObject;
};

/** 把 Task 拍成 tldraw 可持久化的 props。卡片只读自己的 props,不读外部 Map。 */
export function taskToCardProps(task: Task | undefined, taskId: string): TaskCardShapeProps {
  return {
    taskId,
    w: TASK_CARD_W,
    h: TASK_CARD_H,
    name: task?.name ?? '',
    status: task?.status ?? 'unknown',
    project: task?.project ?? '',
    model: task?.model ?? '',
    provider: task?.provider ?? '',
    agentKind: task?.agentKind ?? '',
    customTitle: '',
    messageCount: task?.messageCount ?? 0,
    tokenCount: task?.tokenCount ?? 0,
    lastActivity: task ? +new Date(task.lastActivity) : 0,
  };
}

export function cardPropsChanged(a: TaskCardShapeProps, b: TaskCardShapeProps): boolean {
  return (
    a.name !== b.name ||
    a.status !== b.status ||
    a.project !== b.project ||
    a.model !== b.model ||
    a.provider !== b.provider ||
    a.agentKind !== b.agentKind ||
    a.customTitle !== b.customTitle ||
    a.messageCount !== b.messageCount ||
    a.tokenCount !== b.tokenCount ||
    a.lastActivity !== b.lastActivity
  );
}

const taskCardVersions = createShapePropsMigrationIds('task-card', {
  AddAgentKind: 1,
  AddTokenCount: 2,
  AddCustomTitle: 3,
});

export class TaskCardShapeUtil extends ShapeUtil<TaskCardShape> {
  static override type = TASK_CARD_TYPE;
  static override props = {
    taskId: T.string,
    w: T.number,
    h: T.number,
    name: T.string,
    status: T.string,
    project: T.string,
    model: T.string,
    provider: T.string,
    agentKind: T.string,
    customTitle: T.string,
    messageCount: T.number,
    tokenCount: T.number,
    lastActivity: T.number,
  };
  static override migrations = createShapePropsMigrationSequence({
    sequence: [
      {
        id: taskCardVersions.AddAgentKind,
        up: (props) => ({ ...props, agentKind: props.agentKind ?? '' }),
        down: ({ agentKind: _agentKind, ...props }) => props,
      },
      {
        id: taskCardVersions.AddTokenCount,
        up: (props) => ({ ...props, tokenCount: props.tokenCount ?? 0 }),
        down: ({ tokenCount: _tokenCount, ...props }) => props,
      },
      {
        id: taskCardVersions.AddCustomTitle,
        up: (props) => ({ ...props, customTitle: props.customTitle ?? '' }),
        down: ({ customTitle: _customTitle, ...props }) => props,
      },
    ],
  });

  override canResize(_shape: TaskCardShape) {
    return true;
  }

  override isAspectRatioLocked(_shape: TaskCardShape) {
    return false;
  }

  override hideRotateHandle(_shape: TaskCardShape) {
    return true;
  }

  override canEdit(_shape: TaskCardShape) {
    return false;
  }

  override onDoubleClick(shape: TaskCardShape) {
    if (shape.props.status === 'deleted') return;
    handleShapeDoubleClick(this.editor, shape);
  }

  override getDefaultProps(): TaskCardShapeProps {
    return {
      taskId: '',
      w: TASK_CARD_W,
      h: TASK_CARD_H,
      name: '',
      status: 'unknown',
      project: '',
      model: '',
      provider: '',
      agentKind: '',
      customTitle: '',
      messageCount: 0,
      tokenCount: 0,
      lastActivity: 0,
    };
  }

  override getGeometry(shape: TaskCardShape) {
    return new Rectangle2d({
      width: shape.props.w,
      height: shape.props.h,
      isFilled: true,
    });
  }

  override onResize(shape: TaskCardShape, info: TLResizeInfo<TaskCardShape>) {
    const next = resizeBox(shape, info);
    return { ...next, props: { ...next.props, h: TASK_CARD_H } };
  }

  override component(shape: TaskCardShape) {
    return <TaskCardBody shape={shape} />;
  }

  override getIndicatorPath(shape: TaskCardShape) {
    const path = new Path2D();
    path.roundRect(0, 0, shape.props.w, shape.props.h, TASK_CARD_RADIUS);
    return path;
  }
}

/**
 * 独立函数组件:tldraw 的 ShapeUtil.component 只负责返回它。
 * 样式全部打在 HTMLContainer 上(宽高/背景/圆角),避免内层 overflow:hidden
 * 叠在 tldraw 的 CSS transform 上触发 Chrome「先黑块、拖一下才绘字」的合成 bug。
 */
function TaskCardBody({ shape }: { shape: TaskCardShape }) {
  const editor = useEditor();
  const { t } = useTranslation();
  const { isolate, onOpenClick, onOpenDoubleClick } = useTaskCardEvents(shape.id, shape.props.taskId);
  const { name, status, project, model, provider, agentKind, customTitle, tokenCount, taskId } =
    shape.props;
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(customTitle || name || '');
  const card = useAgentPhase(taskId, status);
  const shownStatus = card.task;
  const title = customTitle || name || t('board.loadingTitle');

  const commitTitle = () => {
    const next = titleDraft.trim();
    if (next !== (customTitle || '')) {
      editor.updateShapes([{
        id: shape.id,
        type: 'task-card',
        props: { customTitle: next },
      }]);
    }
    setEditingTitle(false);
  };

  const startTitleEdit = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setTitleDraft(customTitle || name || '');
    setEditingTitle(true);
  };
  useLayoutEffect(() => {
    if (Math.abs(shape.props.h - TASK_CARD_H) > 1) {
      editor.updateShapes([{ id: shape.id, type: 'task-card', props: { h: TASK_CARD_H } }]);
    }
  }, [editor, shape.id, shape.props.h]);

  return (
    <HTMLContainer
      style={{
        width: shape.props.w,
        height: TASK_CARD_H,
        borderRadius: TASK_CARD_RADIUS,
        transform: 'translateZ(0)',
        isolation: 'isolate',
      }}
    >
      <div className={`tl-task-card${isRunningPhase(shownStatus) ? ' is-run' : ''}`}>
        <div className="tl-task-card__bot">
          <BloubStatusIcon status={shownStatus} size={TASK_CARD_ICON} paper="#16161c" />
          <AgentMark kind={agentKind} className="tl-task-card__agent" />
        </div>
        <div className="tl-task-card__body">
          <div className="tl-task-card__top">
            <span className="tl-task-card__project" title={project}>
              {project || '—'}
            </span>
            {shownStatus === 'deleted' ? (
              <span className="tl-task-card__deleted-mark">{t('status.deleted')}</span>
            ) : (
              <button
                type="button"
                className="tl-task-card__preview"
                title={t('board.openTerminal')}
                aria-label={t('board.openTerminal')}
                onPointerDown={isolate}
                onPointerUp={isolate}
                onClick={onOpenClick}
                onDoubleClick={onOpenDoubleClick}
              >
                <SquareTerminal size={12} strokeWidth={2.4} />
              </button>
            )}
          </div>
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={(event) => setTitleDraft(event.target.value)}
              onBlur={commitTitle}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  commitTitle();
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  setEditingTitle(false);
                }
              }}
              className="tl-task-card__title-input"
              aria-label={t('board.renameTitle')}
            />
          ) : (
            <div
              className="tl-task-card__title"
              title={title}
              onDoubleClick={startTitleEdit}
            >
              {title}
            </div>
          )}
          <div className="tl-task-card__meta">
            <StatusLamps status={card} />
            {shownStatus !== 'deleted' && <ModelMark model={model} provider={provider} />}
            <TokenCount value={tokenCount || undefined} />
          </div>
        </div>
      </div>
    </HTMLContainer>
  );
}
