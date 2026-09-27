import { useEffect, useMemo, useRef, useState } from 'react';
import { TerminalClient } from '@bohemian/terminal-client';
import type { CanvasTerminalNode } from '@bohemian/terminal-canvas';
import { getBoardTerminalApi } from '@/board/terminalApi';
import { clearBoardTaskAttention } from '@/board/terminalActivity';
import { isLiveSuppressed } from '@/board/terminalLive';
import type { Task } from '@/types';

export type View = 'board' | 'grid';

/**
 * Terminal 管理 Hook
 * 
 * 职责：
 * 1. 管理 TerminalClient 实例
 * 2. 生成 terminalNodes Map
 * 3. 处理打开终端的逻辑（包括延迟打开）
 * 4. 管理 pendingTerminalNodeId（等待白板挂载后打开）
 */
export function useTerminalManagement(tasks: Task[], view: View, setView: (v: View) => void) {
  const terminalClient = useMemo(
    () => new TerminalClient({ url: terminalWebSocketUrl() }),
    []
  );

  const pendingTerminalNodeId = useRef<string | null>(null);

  const terminalNodes = useMemo(
    () =>
      new Map<string, CanvasTerminalNode>(
        tasks.map((task) => [
          task.id,
          {
            id: task.id,
            sessionId: task.id,
            cwd: task.workingDir,
            title: task.name,
            agentKind: task.agentKind,
            live: task.status === 'running' && !isLiveSuppressed(task.id),
          },
        ])
      ),
    [tasks]
  );

  // 清理连接
  useEffect(() => () => terminalClient.disconnect(), [terminalClient]);

  // 打开终端：如果不在白板视图或API未就绪，则延迟打开
  const openTerminalForTask = (taskId: string, taskOverride?: Task) => {
    clearBoardTaskAttention(taskId);
    const api = getBoardTerminalApi();
    const node = taskOverride
      ? {
          id: taskOverride.id,
          sessionId: taskOverride.id,
          cwd: taskOverride.workingDir,
          title: taskOverride.name,
          agentKind: taskOverride.agentKind,
          live: taskOverride.status === 'running',
        }
      : terminalNodes.get(taskId) ?? { id: taskId };
    if (view !== 'board' || !api) {
      pendingTerminalNodeId.current = taskId;
      setView('board');
      return;
    }
    void api.openForNode(node);
  };

  const createNewTerminal = () => {
    if (view !== 'board') setView('board');
    const open = () => void getBoardTerminalApi()?.createFree();
    if (getBoardTerminalApi()) open();
    else window.setTimeout(open, 80);
  };

  // 处理延迟打开终端
  useEffect(() => {
    if (view !== 'board' || !pendingTerminalNodeId.current) return;
    const taskId = pendingTerminalNodeId.current;
    const timer = window.setTimeout(() => {
      if (pendingTerminalNodeId.current !== taskId) return;
      const api = getBoardTerminalApi();
      if (!api) return;
      pendingTerminalNodeId.current = null;
      void api.openForNode(terminalNodes.get(taskId) ?? { id: taskId });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [terminalNodes, view]);

  return {
    terminalClient,
    terminalNodes,
    openTerminalForTask,
    createNewTerminal,
  };
}

function terminalWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:18720/ws/terminal';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/terminal`;
}
