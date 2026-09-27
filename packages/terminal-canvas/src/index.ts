/**
 * @package terminal-canvas
 * 
 * 画板终端集成
 * 
 * 职责：
 * - 将终端功能集成到画板系统
 * - 管理节点和终端的映射关系
 * - 提供画板专用的终端交互组件
 */

export { CanvasTerminalIntegration } from './CanvasTerminalIntegration';
export type {
  CanvasTerminalIntegrationHandle,
  CanvasTerminalIntegrationProps,
  CanvasTerminalNode,
} from './CanvasTerminalIntegration';
export { CanvasTerminalWindow, defaultBounds } from './CanvasTerminalWindow';
export type { CanvasTerminalBounds, CanvasTerminalWindowState } from './CanvasTerminalWindow';
