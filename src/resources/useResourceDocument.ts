import { useEffect, useState } from 'react';
import { isResourceRefreshForced, useResourceRefreshRevision } from './resourceRefresh';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import { findBoardResourceProvider } from '@/board/plugins/resourceRuntime';
import type { BoardResourceDocument } from '@/board/plugins/resourceTypes';
import { boardResourceProviderCapabilities } from './resourceApi';

export type ResourceDocumentState =
  | { status: 'loading' }
  | { status: 'deferred' }
  | { status: 'ready'; document: BoardResourceDocument }
  | { status: 'error'; error: string };

export function useResourceDocument(
  resource: TerminalResourceRef,
  defer = false,
): ResourceDocumentState {
  const [state, setState] = useState<ResourceDocumentState>({ status: 'loading' });
  const provider = findBoardResourceProvider(resource);

  const revision = useResourceRefreshRevision(resource);
  const shouldDefer = defer && !isResourceRefreshForced(resource);

  useEffect(() => {
    const controller = new AbortController();
    if (shouldDefer) {
      setState({ status: 'deferred' });
      return () => controller.abort();
    }
    setState({ status: 'loading' });
    if (!provider) {
      setState({ status: 'error', error: 'No resource provider is available.' });
      return () => controller.abort();
    }
    void provider.load(resource, boardResourceProviderCapabilities, controller.signal)
      .then((document) => setState({ status: 'ready', document }))
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setState({
            status: 'error',
            error: error instanceof Error ? error.message : 'Unable to load resource',
          });
        }
      });
    return () => controller.abort();
  }, [provider, resource, defer, revision]);

  return state;
}

export function resourcePreviewUrl(resource: TerminalResourceRef): string | undefined {
  if (!resource.path) return undefined;
  return `/api/fs/preview?${new URLSearchParams({ path: resource.path, cwd: resource.cwd }).toString()}`;
}
