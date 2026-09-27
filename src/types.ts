export interface Task {
  id: string;
  /** 来源 Agent，由后端适配器写入 */
  agentKind?: 'codex' | 'claude-code' | 'pi' | string;
  name: string; // 短标题(首条用户消息截断)
  fullText: string; // 首条用户消息全文
  project: string;
  workingDir: string;
  status: 'running' | 'completed' | 'paused' | 'pending' | 'deleted';
  deletedAt?: Date;
  model: string;
  provider: string;
  progress: number; // -1 表示运行中(不确定进度), 100 完成
  startTime: Date;
  lastActivity: Date;
  size: number; // treemap 面积权重
  messageCount: number;
  toolCalls: number;
  tools: string[];
  /** 打开该会话的地址，由对应 Agent 适配器提供 */
  openUrl: string;
}
