export type TerminalOutputDrain = (deadline: number) => boolean

export type TerminalOutputJob = {
  drain: TerminalOutputDrain
  hasPending: () => boolean
  isActive: () => boolean
}

export class TerminalOutputScheduler {
  private readonly jobs = new Map<string, TerminalOutputJob>()
  private scheduled = false

  register(key: string, job: TerminalOutputJob): () => void {
    this.jobs.set(key, job)
    return () => {
      if (this.jobs.get(key) === job) this.jobs.delete(key)
    }
  }

  schedule(key: string): void {
    if (!this.jobs.has(key) || this.scheduled) return
    this.scheduled = true
    requestAnimationFrame(() => this.drain())
  }

  private drain(): void {
    this.scheduled = false
    const deadline = performance.now() + 8
    const jobs = [...this.jobs.entries()].sort(([, left], [, right]) =>
      Number(right.isActive()) - Number(left.isActive())
    )
    let pending = false
    const pendingKeys = new Set<string>()
    for (const [key, job] of jobs) {
      if (performance.now() >= deadline) {
        if (job.hasPending()) pendingKeys.add(key)
        pending = pending || job.hasPending()
        continue
      }
      const more = job.drain(deadline)
      if (more || job.hasPending()) pendingKeys.add(key)
      pending = pending || more || job.hasPending()
    }
    if (pending) {
      const nextKey = jobs.find(([key, job]) => pendingKeys.has(key) || job.hasPending())?.[0]
      if (nextKey) this.schedule(nextKey)
    }
  }
}

const schedulers = new WeakMap<object, TerminalOutputScheduler>()

export function getTerminalOutputScheduler(client: object): TerminalOutputScheduler {
  const existing = schedulers.get(client)
  if (existing) return existing
  const created = new TerminalOutputScheduler()
  schedulers.set(client, created)
  return created
}
