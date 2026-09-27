const suppressedLiveUntil = new Map<string, number>();

export function suppressLiveSession(id: string, ms = 10_000): void {
  if (!id) return;
  suppressedLiveUntil.set(id, Date.now() + ms);
}

export function isLiveSuppressed(id: string): boolean {
  const until = suppressedLiveUntil.get(id);
  if (!until) return false;
  if (Date.now() > until) {
    suppressedLiveUntil.delete(id);
    return false;
  }
  return true;
}
