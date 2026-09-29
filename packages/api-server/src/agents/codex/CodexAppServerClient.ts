import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';

type RpcResult = {
  id?: number;
  result?: unknown;
  error?: { message?: string };
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

/**
 * Small lifecycle wrapper around the official `codex app-server` stdio
 * protocol. It only transports JSON-RPC messages; Codex owns the history
 * schema and pagination semantics.
 */
export class CodexAppServerClient {
  private child: ChildProcessWithoutNullStreams | null = null;
  private startPromise: Promise<void> | null = null;
  private buffer = '';
  private nextId = 1;
  private readonly pending = new Map<number, PendingRequest>();

  constructor(private readonly command = 'codex', private readonly codexHome?: string) {}

  async listThreads(): Promise<Record<string, unknown>[]> {
    await this.ensureStarted();
    const threads: Record<string, unknown>[] = [];
    let cursor: string | null = null;

    // Page through the official history index. The limit protects the API
    // server from accidentally loading an unbounded local history at once.
    for (let page = 0; page < 100; page += 1) {
      const response = await this.request('thread/list', {
        cursor,
        limit: 100,
        sortKey: 'updated_at',
        sortDirection: 'desc',
      }) as { data?: unknown[]; nextCursor?: string | null };

      for (const item of response.data ?? []) {
        if (item && typeof item === 'object') threads.push(item as Record<string, unknown>);
      }

      cursor = response.nextCursor ?? null;
      if (!cursor) break;
    }

    return threads;
  }

  close(): void {
    this.child?.kill();
    this.child = null;
    this.startPromise = null;
    this.rejectPending(new Error('Codex app-server closed'));
  }

  private async ensureStarted(): Promise<void> {
    if (this.child && this.startPromise) return this.startPromise;
    this.startPromise = this.start();
    return this.startPromise;
  }

  private async start(): Promise<void> {
    const child = spawn(this.command, ['app-server', '--stdio'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: this.codexHome ? { ...process.env, CODEX_HOME: this.codexHome } : process.env,
    });
    this.child = child;
    child.stdout.on('data', (chunk: Buffer | string) => this.consume(chunk.toString()));
    child.stderr.on('data', (chunk: Buffer | string) => {
      // Codex writes diagnostics to stderr. Keep the adapter transport-only;
      // callers receive the actionable RPC error if startup fails.
      if (process.env.LOG_LEVEL === 'debug') {
        console.debug(`[codex-app-server] ${chunk.toString().trim()}`);
      }
    });

    const closed = new Promise<never>((_, reject) => {
      child.once('error', (error) => reject(error));
      child.once('exit', (code, signal) => {
        this.child = null;
        this.startPromise = null;
        this.rejectPending(new Error(`Codex app-server exited (${code ?? signal ?? 'unknown'})`));
      });
    });

    const initialized = this.request('initialize', {
      clientInfo: {
        name: 'bohemian-agent-control',
        title: 'Bohemian Agent Control',
        version: '0.1.0',
      },
      capabilities: { experimentalApi: true },
    });

    await Promise.race([initialized, closed]);
    this.notify('initialized', {});
  }

  private request(method: string, params: Record<string, unknown>): Promise<unknown> {
    const child = this.child;
    if (!child) return Promise.reject(new Error('Codex app-server is not running'));

    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex request timed out: ${method}`));
      }, 30_000);
      this.pending.set(id, { resolve, reject, timer });
      child.stdin.write(`${JSON.stringify({ method, id, params })}\n`);
    });
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.child?.stdin.write(`${JSON.stringify({ method, params })}\n`);
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        this.handleMessage(JSON.parse(line) as RpcResult);
      } catch {
        // Ignore non-JSON diagnostics; protocol responses remain line-delimited.
      }
    }
  }

  private handleMessage(message: RpcResult): void {
    if (typeof message.id !== 'number') return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.error) pending.reject(new Error(message.error.message || 'Codex RPC error'));
    else pending.resolve(message.result);
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
