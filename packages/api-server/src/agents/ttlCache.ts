/** In-flight + TTL cache so digest and listSessions share one directory scan. */
export function createTtlCache<T>(ttlMs: number) {
  let cached: { at: number; data: T } | null = null;
  let inflight: Promise<T> | null = null;

  return {
    get(load: () => Promise<T>): Promise<T> {
      if (cached && Date.now() - cached.at < ttlMs) return Promise.resolve(cached.data);
      if (inflight) return inflight;
      inflight = load()
        .then((data) => {
          cached = { at: Date.now(), data };
          inflight = null;
          return data;
        })
        .catch((error) => {
          inflight = null;
          throw error;
        });
      return inflight;
    },
    clear() {
      cached = null;
      inflight = null;
    },
  };
}
