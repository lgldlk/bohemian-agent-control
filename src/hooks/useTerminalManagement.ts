import { useEffect, useMemo, useRef, useState } from 'react';
import { TerminalClient } from '@bohemian/terminal-client';
import type { CanvasTerminalNode } from '@bohemian/terminal-canvas';
import { getBoardTerminalApi, subscribeBoardTerminalApi } from '@/board/terminalApi';
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
  const pendingFreeTerminalRef = useRef(false);
  const creatingFreeTerminalRef = useRef(false);

  const requestFreeTerminal = (api: ReturnType<typeof getBoardTerminalApi>) => {
    if (!api || creatingFreeTerminalRef.current) return;
    creatingFreeTerminalRef.current = true;
    void api.createFree()
      .catch((error) => {
        console.error('[Terminal] failed to create a free terminal', error);
      })
      .finally(() => {
        creatingFreeTerminalRef.current = false;
      });
  };

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
    const api = getBoardTerminalApi();
    const task = taskOverride ?? tasks.find((item) => item.id === taskId);
    const node = task
      ? {
          id: task.id,
          sessionId: task.id,
          cwd: task.workingDir,
          title: task.name,
          agentKind: task.agentKind,
          live: task.status === 'running' && !isLiveSuppressed(task.id),
        }
      : terminalNodes.get(taskId);
    // Never create a bare shell for a task card. A provider and working
    // directory are required to build a resume command deterministically.
    if (!node || !node.agentKind || !node.cwd) return;
    if (view !== 'board' || !api) {
      pendingTerminalNodeId.current = taskId;
      setView('board');
      return;
    }
    void api.openForNode(node).catch((error) => {
      console.error('[Terminal] failed to open terminal', error);
    });
  };

  const addEmptyTerminal = () => {
    if (view !== 'board') setView('board');
    const api = getBoardTerminalApi();
    if (api) {
      requestFreeTerminal(api);
      return;
    }
    pendingFreeTerminalRef.current = true;
  };

  useEffect(() => {
    if (view !== 'board') return;
    const tryOpenPending = () => {
      const api = getBoardTerminalApi();
      if (!api) return;
      if (pendingFreeTerminalRef.current) {
        pendingFreeTerminalRef.current = false;
        requestFreeTerminal(api);
      }
      const taskId = pendingTerminalNodeId.current;
      if (!taskId) return;
      const node = terminalNodes.get(taskId);
      if (!node || !node.agentKind || !node.cwd) return;
      pendingTerminalNodeId.current = null;
      void api.openForNode(node).catch((error) => {
        console.error('[Terminal] failed to open pending terminal', error);
      });
    };
    tryOpenPending();
    return subscribeBoardTerminalApi(tryOpenPending);
  }, [terminalNodes, view]);

  return {
    terminalClient,
    terminalNodes,
    openTerminalForTask,
    addEmptyTerminal,
  };
}

function terminalWebSocketUrl(): string {
  if (typeof window === 'undefined') return 'ws://127.0.0.1:18720/ws/terminal';
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/terminal`;
}
