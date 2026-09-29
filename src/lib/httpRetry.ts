const TRANSIENT_HTTP_STATUSES = new Set([502, 503, 504]);

export interface TransientFetchOptions {
  delaysMs?: readonly number[];
  fetcher?: typeof fetch;
}

/** Retries short-lived proxy/service outages while preserving abort semantics. */
export async function fetchWithTransientRetry(
  input: RequestInfo | URL,
  init: RequestInit = {},
  options: TransientFetchOptions = {},
): Promise<Response> {
  const delaysMs = options.delaysMs ?? [200, 600, 1_400];
  const fetcher = options.fetcher ?? fetch;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetcher(input, init);
      if (!TRANSIENT_HTTP_STATUSES.has(response.status) || attempt >= delaysMs.length) {
        return response;
      }
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (
        init.signal?.aborted
        || isAbortError(error)
        || !(error instanceof TypeError)
        || attempt >= delaysMs.length
      ) throw error;
    }

    await wait(delaysMs[attempt], init.signal);
  }
}

function wait(delayMs: number, signal?: AbortSignal | null): Promise<void> {
  if (signal?.aborted) return Promise.reject(abortError());

  return new Promise((resolve, reject) => {
    const timer = setTimeout(done, delayMs);

    function done() {
      signal?.removeEventListener('abort', aborted);
      resolve();
    }

    function aborted() {
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      reject(abortError());
    }

    signal?.addEventListener('abort', aborted, { once: true });
  });
}

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError');
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}
