import { describe, expect, it, vi } from 'vitest';
import { fetchWithTransientRetry } from './httpRetry';

describe('fetchWithTransientRetry', () => {
  it('retries a transient proxy response', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 502 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));

    const response = await fetchWithTransientRetry('/api/sessions', {}, {
      delaysMs: [0],
      fetcher,
    });

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('returns non-transient failures without retrying', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 500 }));

    const response = await fetchWithTransientRetry('/api/sessions', {}, {
      delaysMs: [0, 0],
      fetcher,
    });

    expect(response.status).toBe(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('retries a short-lived network failure', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError('connection reset'))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));

    const response = await fetchWithTransientRetry('/api/digest', {}, {
      delaysMs: [0],
      fetcher,
    });

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('stops retrying when the request is aborted', async () => {
    const controller = new AbortController();
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response(null, { status: 502 }));

    const request = fetchWithTransientRetry('/api/sessions', {
      signal: controller.signal,
    }, {
      delaysMs: [100],
      fetcher,
    });
    await Promise.resolve();
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
