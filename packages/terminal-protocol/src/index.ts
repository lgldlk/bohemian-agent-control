/**
 * Terminal Protocol
 * 前后端共享的协议定义
 */

export * from './types';
export * from './agentStatus';
export * from './binaryFrame';
export * from './providerStatus';
export * from './resources';
export {
  createOscTitleParser,
  detectAgentActivity,
  foldAgentActivity,
  mergeAgentActivity,
} from './agentActivity';
export {
  createCommandBuffer,
  pushTerminalInput,
  searchTerminalText,
  stripTerminalText,
} from './commandHistory';
export type { CommandBuffer, RecordedCommand } from './commandHistory';
