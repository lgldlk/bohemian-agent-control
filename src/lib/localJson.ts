/** Browser storage is optional; a malformed value never enters an application store. */
export function readLocalJson<T>(key: string, decode: (value: unknown) => T | null, fallback: () => T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw !== null) return decode(JSON.parse(raw)) ?? fallback();
  } catch {
    // Storage may be unavailable or contain malformed JSON.
  }
  return fallback();
}

export function writeLocalJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Optional persistence must not interrupt an in-memory update.
  }
}
