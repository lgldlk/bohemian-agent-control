import { createContext, useContext, useSyncExternalStore, type PropsWithChildren } from 'react';
import type { BoardPluginRuntimeCore } from './runtimeCore';
import {
  getActiveBoardPluginRuntime,
  getActiveBoardPluginRuntimeRevision,
  subscribeActiveBoardPluginRuntime,
} from './activeRuntimeRegistry';

const BoardPluginRuntimeContext = createContext<BoardPluginRuntimeCore | null>(null);

export function BoardPluginRuntimeProvider({
  runtime,
  children,
}: PropsWithChildren<{ runtime: BoardPluginRuntimeCore }>) {
  return (
    <BoardPluginRuntimeContext.Provider value={runtime}>
      {children}
    </BoardPluginRuntimeContext.Provider>
  );
}

export function useBoardPluginRuntime(): BoardPluginRuntimeCore {
  const scopedRuntime = useContext(BoardPluginRuntimeContext);
  useSyncExternalStore(
    scopedRuntime ? () => () => {} : subscribeActiveBoardPluginRuntime,
    scopedRuntime ? () => 0 : getActiveBoardPluginRuntimeRevision,
  );
  return scopedRuntime ?? getActiveBoardPluginRuntime();
}
