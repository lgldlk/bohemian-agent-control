import { useEffect, useRef } from 'react';
import { useEditor } from 'tldraw';
import type { TerminalClient } from '@bohemian/terminal-client';
import type { Task } from '@/types';
import { mountBoardPluginRuntime } from './plugins/runtime';
import type { BoardPluginRuntimeCore } from './plugins/runtimeCore';
import { useBoardPages } from './useBoardPages';
import { useBoardTerminals } from './useBoardTerminals';
import { useBoardNodeCascade } from './events';

export function BoardPluginRuntimeBridge({ tasks, runtime }: { tasks: readonly Task[]; runtime: BoardPluginRuntimeCore }) {
  const editor = useEditor();
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  useEffect(() => mountBoardPluginRuntime(editor, tasksRef, runtime), [editor, runtime]);
  return null;
}

export function BoardPageBridge() {
  useBoardPages();
  return null;
}

export function BoardTerminalRuntime({ client }: { client: TerminalClient }) {
  const editor = useEditor();
  useBoardTerminals(client, editor);
  useBoardNodeCascade(editor);
  return null;
}
