import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as pty from 'node-pty';
import {
  createAgentStatusParser,
  createCommandBuffer,
  createOscTitleParser,
  detectAgentActivity,
  foldAgentActivity,
  pushTerminalInput,
  searchTerminalText,
  type CommandBuffer,
  type ParsedAgentStatus,
  type TerminalCreateOptions,
  type TerminalEvent,
  type TerminalHistoryEntry,
  type TerminalId,
  type TerminalInfo,
  type TerminalSearchMatch,
  type TerminalSnapshot,
} from '@bohemian/terminal-protocol';
import { createTerminalBufferModel, type TerminalBufferModel } from './terminalScreenMode';
import { writePiStatusExtension } from './piStatusExtension';
import {
  agentSessionIdForShell,
  hasTmuxSession,
  hideTmuxStatus,
  killPtyTree,
  killTmuxSession,
  listPiSessionHeaders,
  selectPiLaunchSession,
  tmuxAvailable,
  tmuxName,
  type PiSessionHeader,
} from './ptyAgent';

export interface PTYManagerOptions {
  stateDir?: string;
  maxSessions?: number;
  maxScrollbackChars?: number;
  /** Keep PTYs in tmux so a terminal-server restart can reattach them. */
  persistentSessions?: boolean;
  tmuxCommand?: string;
  hookWsUrl?: string;
  hookToken?: string;
  /** Install provider bridges into the terminal server runtime, not the user's home. */
  enableAgentHooks?: boolean;
}

export interface PTYSession {
  id: TerminalId;
  process: pty.IPty | null;
  info: TerminalInfo;
  pendingOutput: string[];
  pendingOutputBytes: number;
  pendingOutputStart: number | null;
  outputOffset: number;
  bufferTimer: NodeJS.Timeout | null;
  persistTimer: NodeJS.Timeout | null;
  persistInFlight: Promise<void> | null;
  persistQueued: boolean;
  closed: boolean;
  paused: boolean;
  droppedOutput: boolean;
  inFlightSequence: number;
  inFlightBytes: number;
  lastAckedSequence: number;
  sequence: number;
  scrollback: string;
  truncated: boolean;
  subscribers: Set<(data: string, sequence: number, bytes: number, droppedOutput: boolean, sourceStart: number, sourceEnd: number) => void>;
  parseOscTitle: (chunk: string) => string[];
  parseOscStatus: (chunk: string) => { cleanData: string; payloads: ParsedAgentStatus[] };
  commandBuffer: CommandBuffer;
  tmuxSession?: string;
  persistent: boolean;
  bufferMode: TerminalBufferModel;
  normalScrollback: string;
  alternateFrame: string;
}

type PersistedSession = Pick<PTYSession, 'sequence' | 'truncated' | 'outputOffset'> & {
  info: TerminalInfo;
  commands?: TerminalHistoryEntry[];
  tmuxSession?: string;
  alternateScreen?: boolean;
  normalScrollback?: string;
  alternateFrame?: string;
};

/** Owns local PTYs, their bounded scrollback, and restart-safe metadata. */
export class PTYManager {
  private readonly sessions = new Map<TerminalId, PTYSession>();
  private readonly eventSubscribers = new Set<(event: TerminalEvent) => void>();
  private readonly stateDir: string;
  private readonly maxSessions: number;
  private readonly maxScrollbackChars: number;
  private readonly maxPendingOutputChars: number;
  private readonly agentTimer: NodeJS.Timeout;
  private readonly persistentSessions: boolean;
  private readonly tmuxCommand: string;
  private readonly tmuxSocket: string;
  private readonly hookWsUrl?: string;
  private readonly hookToken?: string;
  private readonly piStatusExtensionPath?: string;
  private disposing = false;

  constructor(options: PTYManagerOptions = {}) {
    this.stateDir = options.stateDir ?? path.join(os.homedir(), '.bohemian-agent-control', 'terminals');
    this.maxSessions = options.maxSessions ?? 50;
    this.maxScrollbackChars = options.maxScrollbackChars ?? 1_000_000;
    this.maxPendingOutputChars = Math.min(this.maxScrollbackChars, 64_000);
    this.tmuxCommand = options.tmuxCommand ?? process.env.TMUX_COMMAND ?? 'tmux';
    this.tmuxSocket = path.join(this.stateDir, '.tmux.sock');
    this.hookWsUrl = options.hookWsUrl;
    this.hookToken = options.hookToken;
    if (options.enableAgentHooks !== false) {
      try {
        this.piStatusExtensionPath = writePiStatusExtension(path.join(this.stateDir, 'agent-hooks', 'pi'));
      } catch (error) {
        console.warn(`[PTY] ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.persistentSessions = options.persistentSessions ?? tmuxAvailable(this.tmuxCommand, this.tmuxSocket);
    if (this.persistentSessions && !tmuxAvailable(this.tmuxCommand, this.tmuxSocket)) {
      console.warn(`[PTY] tmux not found; terminal processes cannot be reattached after a server restart`);
    }
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    if (this.persistentSessions) hideTmuxStatus(this.tmuxCommand, this.tmuxSocket);
    this.restoreArchivedSessions();
    this.restoreLiveSessions();
    this.agentTimer = setInterval(() => void this.refreshAgentBindings(), 1500);
    void this.refreshAgentBindings();
  }

  spawn(options: TerminalCreateOptions = {}): TerminalId {
    if (this.runningCount() >= this.maxSessions) {
      throw new Error(`Terminal session limit reached (${this.maxSessions})`);
    }

    const id = this.createId();
    const now = Date.now();
    const size = normalizeSize(options.size);
    const cwd = this.resolveCwd(options.cwd);
    const shell = options.shell || this.getDefaultShell();
    const session: PTYSession = {
      id,
      process: null,
      info: {
        id,
        nodeId: options.nodeId,
        launchId: options.launchId,
        agentKind: options.agentKind,
        startupCommand: options.startupCommand?.trim() || undefined,
        launchToken: options.launchToken,
        startupCommandDelivery: options.startupCommandDelivery ?? (options.startupCommand ? 'direct' : undefined),
        startupStatus: options.startupCommand ? 'pending' : 'none',
        incarnationId: crypto.randomUUID(),
        title: options.title?.trim() || (options.nodeId ? `Node ${options.nodeId}` : 'Terminal'),
        cwd,
        shell,
        status: 'starting',
        createdAt: now,
        updatedAt: now,
        alternateScreen: false,
        size,
      },
      pendingOutput: [],
      pendingOutputBytes: 0,
      pendingOutputStart: null,
      outputOffset: 0,
      bufferTimer: null,
      persistTimer: null,
      persistInFlight: null,
      persistQueued: false,
      closed: false,
      paused: false,
      droppedOutput: false,
      inFlightSequence: 0,
      inFlightBytes: 0,
      lastAckedSequence: 0,
      sequence: 0,
      scrollback: '',
      truncated: false,
      subscribers: new Set(),
      parseOscTitle: createOscTitleParser(),
      parseOscStatus: createAgentStatusParser(),
      commandBuffer: createCommandBuffer(),
      tmuxSession: this.persistentSessions ? tmuxName(id) : undefined,
      persistent: this.persistentSessions,
      bufferMode: createTerminalBufferModel(),
      normalScrollback: '',
      alternateFrame: '',
    };
    this.sessions.set(id, session);
    this.startProcess(session, options.args ?? [], options.env, false);
    this.emit({ type: 'created', terminal: this.cloneInfo(session.info) });
    return id;
  }

  restart(id: TerminalId): TerminalInfo | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    if (this.runningCount() >= this.maxSessions && session.info.status !== 'running') {
      throw new Error(`Terminal session limit reached (${this.maxSessions})`);
    }
    if (session.process) {
      const pid = session.process.pid;
      try { session.process.kill('SIGTERM'); } catch { /* already exited */ }
      if (!session.tmuxSession) void killPtyTree(pid);
    }
    if (session.tmuxSession) killTmuxSession(session.tmuxSession, this.tmuxCommand, this.tmuxSocket);
    this.appendScrollback(session, '\r\n\x1b[90m--- terminal restarted ---\x1b[0m\r\n');
    session.info.status = 'starting';
    session.info.incarnationId = crypto.randomUUID();
    session.info.agentStatus = undefined;
    session.info.agentDetail = undefined;
    session.info.agentSessionId = undefined;
    session.inFlightBytes = 0;
    session.lastAckedSequence = session.sequence;
    delete session.info.exitCode;
    this.startProcess(session, [], undefined);
    this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    return this.cloneInfo(session.info);
  }

  private startProcess(
    session: PTYSession,
    args: string[],
    env?: Record<string, string>,
    restoring = false,
  ): void {
    const startupArgs = session.info.startupCommand && !restoring
      ? startupShellArgs(
          session.info.shell,
          providerStartupCommand(session, session.info.startupCommand, this.piStatusExtensionPath),
          session.info.startupCommandDelivery,
          session.info.launchToken,
        )
      : args;
    const command = session.persistent && session.tmuxSession
      ? this.tmuxSpawnArgs(session, startupArgs, restoring)
      : { file: session.info.shell, args: startupArgs };
    const processHandle = pty.spawn(command.file, command.args, {
      name: 'xterm-256color',
      cols: session.info.size.cols,
      rows: session.info.size.rows,
      cwd: session.info.cwd,
      env: {
        ...process.env,
        ...env,
        BOHEMIAN_TERMINAL_ID: session.id,
        ...(session.info.launchToken ? { BOHEMIAN_AGENT_LAUNCH_TOKEN: session.info.launchToken } : {}),
        ...(this.hookWsUrl ? { BOHEMIAN_TERMINAL_WS_URL: this.hookWsUrl } : {}),
        ...(this.hookToken ? { BOHEMIAN_TERMINAL_TOKEN: this.hookToken } : {}),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    });
    session.process = processHandle;
    session.info.pid = processHandle.pid;
    if (session.tmuxSession) hideTmuxStatus(this.tmuxCommand, this.tmuxSocket, session.tmuxSession);
    session.info.status = 'running';
    if (session.info.startupCommand && !restoring) session.info.startupStatus = 'delivered';
    session.info.updatedAt = Date.now();
    this.schedulePersist(session);

    processHandle.onData((data) => this.handleOutput(session.id, data));
    processHandle.onExit(({ exitCode }) => {
      const current = this.sessions.get(session.id);
      if (!current || current.process !== processHandle) return;
      if (this.disposing && current.persistent) return;
      current.process = null;
      current.info.status = 'exited';
      current.info.exitCode = exitCode;
      current.info.agentStatus = undefined;
      current.info.agentDetail = undefined;
      current.info.updatedAt = Date.now();
      delete current.info.pid;
      this.flushOutput(current.id);
      this.persist(current);
      this.emit({ type: 'exit', terminalId: current.id, exitCode });
      this.emit({ type: 'updated', terminal: this.cloneInfo(current.info) });
    });
  }

  private tmuxSpawnArgs(
    session: PTYSession,
    shellArgs: string[],
    restoring: boolean,
  ): { file: string; args: string[] } {
    const name = session.tmuxSession as string;
    if (restoring) return { file: this.tmuxCommand, args: ['-S', this.tmuxSocket, 'attach-session', '-t', name] };
    return {
      file: this.tmuxCommand,
      args: ['-S', this.tmuxSocket, 'new-session', '-A', '-s', name, '-c', session.info.cwd, '--', session.info.shell, ...shellArgs],
    };
  }

  private handleOutput(id: TerminalId, data: string): void {
    const session = this.sessions.get(id);
    if (!session) return;
    const processed = session.parseOscStatus(data);
    const previousMode = session.bufferMode.getMode();
    const bufferChunk = session.bufferMode.feed(processed.cleanData);
    if (bufferChunk.normal) {
      session.normalScrollback = `${session.normalScrollback}${bufferChunk.normal}`.slice(-this.maxScrollbackChars);
    }
    if (bufferChunk.mode === 'alternate') {
      if (previousMode === 'normal') session.alternateFrame = bufferChunk.alternate;
      else session.alternateFrame = `${session.alternateFrame}${bufferChunk.alternate}`.slice(-this.maxScrollbackChars);
    } else if (previousMode === 'alternate' && bufferChunk.alternate) {
      session.alternateFrame = `${session.alternateFrame}${bufferChunk.alternate}`.slice(-this.maxScrollbackChars);
    }
    if (session.info.alternateScreen !== (bufferChunk.mode === 'alternate')) {
      session.info.alternateScreen = bufferChunk.mode === 'alternate';
      session.info.updatedAt = Date.now();
      this.schedulePersist(session);
      this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    }
    for (const payload of processed.payloads) {
      const now = Date.now();
      session.info.agentDetail = { ...payload, origin: 'osc', observedAt: now };
      if (payload.providerSessionId) this.adoptProviderSession(session, payload.providerSessionId);
      session.info.agentStatus = payload.state === 'working' ? 'working' : payload.state === 'blocked' ? 'blocked' : 'idle';
      session.info.updatedAt = now;
      this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    }
    if (!processed.cleanData) {
      this.schedulePersist(session);
      return;
    }
    this.observeAgentTitles(session, processed.cleanData);
    this.appendScrollback(session, processed.cleanData);
    const outputStart = session.outputOffset;
    session.outputOffset += Buffer.byteLength(processed.cleanData, 'utf8');
    if (session.pendingOutputStart === null) session.pendingOutputStart = outputStart;
    session.pendingOutput.push(processed.cleanData);
    session.pendingOutputBytes += Buffer.byteLength(processed.cleanData, 'utf8');
    while (session.pendingOutputBytes > this.maxPendingOutputChars && session.pendingOutput.length > 1) {
      const dropped = session.pendingOutput.shift() as string;
      session.pendingOutputBytes -= Buffer.byteLength(dropped, 'utf8');
      session.droppedOutput = true;
    }
    if (!session.bufferTimer) session.bufferTimer = setTimeout(() => this.flushOutput(id), 16);
    if (session.pendingOutputBytes >= 16_384) {
      this.flushOutput(id);
    }
    this.schedulePersist(session);
  }

  private observeAgentTitles(session: PTYSession, data: string): void {
    const titles = session.parseOscTitle(data);
    if (titles.length === 0) return;
    if (session.info.agentDetail?.origin === 'osc' && Date.now() - session.info.agentDetail.observedAt < 30 * 60 * 1000) return;
    let next = session.info.agentStatus;
    for (const title of titles) {
      next = foldAgentActivity(next, detectAgentActivity(title));
    }
    if (next === session.info.agentStatus) return;
    session.info.agentStatus = next;
    if (next) {
      session.info.agentDetail = {
        state: next === 'idle' ? 'done' : next,
        origin: 'title',
        observedAt: Date.now(),
      };
    }
    session.info.updatedAt = Date.now();
    this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
  }

  private appendScrollback(session: PTYSession, data: string): void {
    session.sequence += 1;
    session.scrollback += data;
    if (session.scrollback.length > this.maxScrollbackChars) {
      session.scrollback = session.scrollback.slice(-this.maxScrollbackChars);
      session.truncated = true;
    }
    session.info.updatedAt = Date.now();
  }

  private flushOutput(id: TerminalId): void {
    const session = this.sessions.get(id);
    if (!session) return;
    if (session.bufferTimer) clearTimeout(session.bufferTimer);
    session.bufferTimer = null;
    if (session.pendingOutput.length === 0) return;
    if (session.subscribers.size === 0) {
      session.pendingOutput = [];
      session.pendingOutputBytes = 0;
      session.droppedOutput = false;
      return;
    }
    if (session.paused) return;
    const data = session.pendingOutput.join('');
    const sourceStart = session.pendingOutputStart ?? session.outputOffset - Buffer.byteLength(data, 'utf8');
    const sourceEnd = sourceStart + Buffer.byteLength(data, 'utf8');
    session.pendingOutput = [];
    session.pendingOutputBytes = 0;
    session.pendingOutputStart = null;
    const droppedOutput = session.droppedOutput;
    session.droppedOutput = false;
    session.inFlightSequence = session.sequence;
    for (const callback of session.subscribers) callback(data, session.sequence, sourceEnd - sourceStart, droppedOutput, sourceStart, sourceEnd);
  }

  subscribe(id: TerminalId, callback: (data: string, sequence: number, bytes: number, droppedOutput: boolean, sourceStart: number, sourceEnd: number) => void): () => void {
    const session = this.sessions.get(id);
    if (!session) throw new Error(`Terminal ${id} not found`);
    session.subscribers.add(callback);
    return () => {
      session.subscribers.delete(callback);
      if (session.subscribers.size === 0) session.inFlightBytes = 0;
    };
  }

  subscribeEvents(callback: (event: TerminalEvent) => void): () => void {
    this.eventSubscribers.add(callback);
    return () => this.eventSubscribers.delete(callback);
  }

  private emit(event: TerminalEvent): void {
    for (const callback of this.eventSubscribers) callback(event);
  }

  write(id: TerminalId, data: string): boolean {
    const session = this.sessions.get(id);
    if (!session?.process || session.info.status !== 'running') return false;
    try {
      session.process.write(data);
      pushTerminalInput(session.commandBuffer, data);
      this.schedulePersist(session);
      return true;
    } catch {
      return false;
    }
  }

  resize(id: TerminalId, cols: number, rows: number): boolean {
    const session = this.sessions.get(id);
    if (!session || cols < 2 || rows < 1) return false;
    const size = normalizeSize({ cols, rows });
    session.info.size = size;
    session.info.updatedAt = Date.now();
    if (session.process) session.process.resize(size.cols, size.rows);
    this.schedulePersist(session);
    return true;
  }

  rename(id: TerminalId, title: string): TerminalInfo | null {
    const session = this.sessions.get(id);
    const nextTitle = title.trim();
    if (!session || !nextTitle) return null;
    session.info.title = nextTitle.slice(0, 160);
    session.info.updatedAt = Date.now();
    this.persist(session);
    this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    return this.cloneInfo(session.info);
  }

  signal(id: TerminalId, signal: 'SIGINT' | 'SIGTERM' | 'SIGKILL'): boolean {
    const session = this.sessions.get(id);
    if (!session?.process) return false;
    try {
      if (signal === 'SIGINT') session.process.write('\x03');
      else session.process.kill(signal);
      return true;
    } catch {
      return false;
    }
  }

  clearBuffer(id: TerminalId): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.scrollback = '';
    session.truncated = false;
    session.sequence += 1;
    this.persist(session);
    return true;
  }

  pause(id: TerminalId): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.paused = true;
    return true;
  }

  resume(id: TerminalId): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.paused = false;
    this.flushOutput(id);
    return true;
  }

  applyAgentStatus(id: TerminalId, launchToken: string, payload: ParsedAgentStatus): boolean {
    const session = this.sessions.get(id);
    if (!session || !session.info.launchToken || session.info.launchToken !== launchToken) return false;
    const now = Date.now();
    session.info.agentDetail = { ...payload, origin: 'hook', observedAt: now };
    session.info.agentStatus = payload.state === 'working' ? 'working' : payload.state === 'blocked' || payload.state === 'waiting' ? 'blocked' : 'idle';
    if (payload.providerSessionId) this.adoptProviderSession(session, payload.providerSessionId);
    session.info.updatedAt = now;
    this.schedulePersist(session);
    this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    return true;
  }

  ack(id: TerminalId, sequence: number, sourceEnd?: number, incarnationId?: string): boolean {
    const session = this.sessions.get(id);
    if (!session || (incarnationId && session.info.incarnationId !== incarnationId)) return false;
    if (!Number.isFinite(sequence) || sequence <= session.lastAckedSequence) return false;
    if (sourceEnd !== undefined && sourceEnd > session.outputOffset) return false;
    session.lastAckedSequence = sequence;
    session.inFlightBytes = 0;
    this.flushOutput(id);
    return true;
  }

  history(terminalId?: TerminalId, limit = 50): TerminalHistoryEntry[] {
    const cap = clampLimit(limit, 50, 200);
    const entries: TerminalHistoryEntry[] = [];
    for (const session of this.sessions.values()) {
      if (terminalId && session.id !== terminalId) continue;
      for (const command of session.commandBuffer.commands) {
        entries.push({
          terminalId: session.id,
          title: session.info.title,
          command: command.command,
          at: command.at,
        });
      }
    }
    return entries.sort((a, b) => b.at - a.at).slice(0, cap);
  }

  search(query: string, limit = 30): TerminalSearchMatch[] {
    const needle = query.trim();
    if (!needle) return [];
    const cap = clampLimit(limit, 30, 80);
    const matches: TerminalSearchMatch[] = [];
    const folded = needle.toLowerCase();
    for (const session of this.sessions.values()) {
      for (const command of session.commandBuffer.commands) {
        if (!command.command.toLowerCase().includes(folded)) continue;
        matches.push({
          terminalId: session.id,
          title: session.info.title,
          kind: 'command',
          excerpt: command.command,
          at: command.at,
        });
        if (matches.length >= cap) return matches;
      }
      const tail = session.scrollback.slice(-200_000);
      for (const excerpt of searchTerminalText(tail, needle, 5)) {
        matches.push({
          terminalId: session.id,
          title: session.info.title,
          kind: 'output',
          excerpt,
        });
        if (matches.length >= cap) return matches;
      }
    }
    return matches;
  }

  async close(id: TerminalId): Promise<boolean> {
    const session = this.sessions.get(id);
    if (!session) return false;
    session.closed = true;
    session.persistQueued = false;
    if (session.bufferTimer) clearTimeout(session.bufferTimer);
    if (session.persistTimer) clearTimeout(session.persistTimer);
    this.sessions.delete(id);
    const pid = session.process?.pid ?? session.info.pid;
    try { session.process?.kill('SIGTERM'); } catch { /* already exited */ }
    if (session.tmuxSession) killTmuxSession(session.tmuxSession, this.tmuxCommand, this.tmuxSocket);
    else void killPtyTree(pid);
    session.subscribers.clear();
    if (session.persistInFlight) await session.persistInFlight;
    this.removePersisted(id);
    this.emit({ type: 'closed', terminalId: id });
    return true;
  }

  getSnapshot(id: TerminalId): TerminalSnapshot | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    const alternateScreen = session.info.alternateScreen === true;
    return {
      terminalId: id,
      data: alternateScreen ? session.alternateFrame : session.normalScrollback,
      sequence: session.sequence,
      sourceEnd: session.outputOffset,
      truncated: session.truncated,
      alternateScreen,
      ...(alternateScreen ? { scrollbackAnsi: session.normalScrollback } : {}),
    };
  }

  getInfo(id: TerminalId): TerminalInfo | null {
    const session = this.sessions.get(id);
    return session ? this.cloneInfo(session.info) : null;
  }

  list(): TerminalInfo[] {
    return [...this.sessions.values()]
      .map((session) => this.cloneInfo(session.info))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  private runningCount(): number {
    return [...this.sessions.values()].filter((session) => session.info.status === 'running').length;
  }

  private cloneInfo(info: TerminalInfo): TerminalInfo {
    return { ...info, size: { ...info.size } };
  }

  private resolveCwd(requested?: string): string {
    const cwd = requested || os.homedir();
    try {
      return fs.statSync(cwd).isDirectory() ? cwd : os.homedir();
    } catch {
      return os.homedir();
    }
  }

  private getDefaultShell(): string {
    if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe';
    return process.env.SHELL || '/bin/bash';
  }

  private createId(): TerminalId {
    return `terminal-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private paths(id: string): { meta: string; log: string } {
    const safe = id.replace(/[^a-zA-Z0-9_-]/g, '_');
    return {
      meta: path.join(this.stateDir, `${safe}.json`),
      log: path.join(this.stateDir, `${safe}.log`),
    };
  }

  private schedulePersist(session: PTYSession): void {
    if (session.persistTimer) return;
    session.persistTimer = setTimeout(() => {
      session.persistTimer = null;
      this.persist(session);
    }, 500);
  }

  private persist(session: PTYSession): void {
    if (session.closed) return;
    if (session.persistInFlight) {
      session.persistQueued = true;
      return;
    }

    const files = this.paths(session.id);
    const metadata: PersistedSession = {
      info: this.cloneInfo(session.info),
      sequence: session.sequence,
      outputOffset: session.outputOffset,
      truncated: session.truncated,
      alternateScreen: session.info.alternateScreen,
      normalScrollback: session.normalScrollback,
      alternateFrame: session.alternateFrame,
      tmuxSession: session.tmuxSession,
      commands: session.commandBuffer.commands.map((command) => ({
        terminalId: session.id,
        title: session.info.title,
        command: command.command,
        at: command.at,
      })),
    };
    const metadataText = JSON.stringify(metadata);
    const scrollback = session.scrollback;
    let write: Promise<void>;
    write = (async () => {
      await fsp.writeFile(`${files.meta}.tmp`, metadataText, { mode: 0o600 });
      await fsp.rename(`${files.meta}.tmp`, files.meta);
      await fsp.writeFile(files.log, scrollback, { mode: 0o600 });
    })()
      .catch((error) => {
        console.warn(`[PTY] Failed to persist ${session.id}:`, error);
      })
      .finally(() => {
        if (session.persistInFlight !== write) return;
        session.persistInFlight = null;
        if (session.persistQueued && !session.closed) {
          session.persistQueued = false;
          this.persist(session);
        }
      });
    session.persistInFlight = write;
  }

  private removePersisted(id: string): void {
    const files = this.paths(id);
    for (const file of [files.meta, files.log, `${files.meta}.tmp`]) {
      try { fs.rmSync(file, { force: true }); } catch { /* ignore */ }
    }
  }

  private restoreArchivedSessions(): void {
    for (const name of fs.readdirSync(this.stateDir)) {
      if (!name.endsWith('.json')) continue;
      try {
        const metadata = JSON.parse(fs.readFileSync(path.join(this.stateDir, name), 'utf8')) as PersistedSession;
        if (!metadata.info?.id) continue;
        const files = this.paths(metadata.info.id);
        const scrollback = fs.existsSync(files.log) ? fs.readFileSync(files.log, 'utf8') : '';
        const recoverable = Boolean(
          this.persistentSessions
          && metadata.tmuxSession
          && metadata.info.status === 'running',
        );
        const info: TerminalInfo = {
          ...metadata.info,
          incarnationId: metadata.info.incarnationId ?? crypto.randomUUID(),
          status: recoverable ? 'running' : 'exited',
          updatedAt: metadata.info.updatedAt ?? metadata.info.createdAt,
        };
        delete info.pid;
        const bufferMode = createTerminalBufferModel();
        bufferMode.feed(scrollback);
        this.sessions.set(info.id, {
          id: info.id,
          process: null,
          info,
          pendingOutput: [],
          pendingOutputBytes: 0,
          pendingOutputStart: null,
          outputOffset: metadata.outputOffset ?? metadata.sequence ?? 0,
          bufferTimer: null,
          persistTimer: null,
          persistInFlight: null,
          persistQueued: false,
          closed: false,
          paused: false,
          droppedOutput: false,
          inFlightSequence: 0,
          inFlightBytes: 0,
          lastAckedSequence: 0,
          sequence: metadata.sequence ?? 0,
          scrollback: scrollback.slice(-this.maxScrollbackChars),
          truncated: metadata.truncated || scrollback.length > this.maxScrollbackChars,
          subscribers: new Set(),
          parseOscTitle: createOscTitleParser(),
          parseOscStatus: createAgentStatusParser(),
          commandBuffer: createCommandBuffer(
            (metadata.commands ?? []).map((entry) => ({ command: entry.command, at: entry.at })),
          ),
          tmuxSession: this.persistentSessions ? metadata.tmuxSession : undefined,
          persistent: this.persistentSessions && Boolean(metadata.tmuxSession),
          bufferMode,
          normalScrollback: metadata.normalScrollback || bufferMode.getNormalHistory(),
          alternateFrame: metadata.alternateFrame || bufferMode.getAlternateFrame(),
        });
      } catch (error) {
        console.warn(`[PTY] Ignoring corrupt terminal archive ${name}:`, error);
      }
    }
  }

  private restoreLiveSessions(): void {
    for (const session of this.sessions.values()) {
      if (!session.info.status || session.info.status !== 'running' || !session.tmuxSession) continue;
      if (!hasTmuxSession(session.tmuxSession, this.tmuxCommand, this.tmuxSocket)) {
        session.info.status = 'exited';
        delete session.info.pid;
        this.persist(session);
        continue;
      }
      this.startProcess(session, [], undefined, true);
    }
  }

  private async refreshAgentBindings(): Promise<void> {
    const running = [...this.sessions.values()].filter((session) => session.info.status === 'running');
    const cwdHeaders = new Map<string, PiSessionHeader[]>();
    await Promise.all([...new Set(running.map((session) => session.info.cwd).filter(Boolean))].map(async (cwd) => {
      cwdHeaders.set(cwd, await listPiSessionHeaders(cwd));
    }));
    const claimed = new Set<string>();
    const ordered = [...running].sort((a, b) => a.info.createdAt - b.info.createdAt);
    for (const session of ordered) {
      const launched = session.info.launchId?.startsWith('pending-') === true;
      let sessionId = await agentSessionIdForShell(session.info.pid);
      if (!sessionId && session.info.agentKind === 'pi' && launched) {
        sessionId = selectPiLaunchSession(cwdHeaders.get(session.info.cwd) ?? [], session.info.createdAt, claimed);
      }
      if (!sessionId) continue;
      claimed.add(sessionId);
      if (!this.applyLaunchIdentity(session, sessionId, launched && session.info.agentKind === 'pi')) continue;
      session.info.updatedAt = Date.now();
      this.schedulePersist(session);
      this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    }
  }

  private adoptProviderSession(session: PTYSession, providerSessionId: string): void {
    if (session.info.agentKind === 'pi' && session.info.agentSessionId && session.info.agentSessionId !== providerSessionId) return;
    this.applyLaunchIdentity(session, providerSessionId, false);
  }

  private applyLaunchIdentity(session: PTYSession, sessionId: string, forceNode: boolean): boolean {
    let changed = false;
    if (session.info.agentSessionId !== sessionId) {
      session.info.agentSessionId = sessionId;
      changed = true;
    }
    const nodeId = session.info.nodeId;
    const unbound = !nodeId || nodeId.startsWith('pending-') || nodeId === session.info.launchId;
    if ((unbound || forceNode) && nodeId !== sessionId) {
      session.info.nodeId = sessionId;
      changed = true;
    }
    return changed;
  }

  async dispose(): Promise<void> {
    this.disposing = true;
    clearInterval(this.agentTimer);
    const pending: Promise<void>[] = [];
    for (const session of this.sessions.values()) {
      if (session.bufferTimer) clearTimeout(session.bufferTimer);
      if (session.persistTimer) clearTimeout(session.persistTimer);
      session.persistQueued = false;
      session.closed = true;
      if (session.persistInFlight) await session.persistInFlight;
      session.closed = false;

      if (session.persistent && session.tmuxSession && session.info.status === 'running') {
        // Kill only the attach client. tmux keeps the shell and Agent alive.
        try { session.process?.kill(); } catch { /* already exited */ }
        session.process = null;
      } else {
        try { session.process?.kill(); } catch { /* already exited */ }
        session.process = null;
        session.info.status = 'exited';
        session.info.updatedAt = Date.now();
        delete session.info.pid;
      }

      this.persist(session);
      session.closed = true;
      if (session.persistInFlight) pending.push(session.persistInFlight);
    }
    await Promise.all(pending);
    this.eventSubscribers.clear();
  }
}

function providerStartupCommand(session: PTYSession, command: string, piExtensionPath?: string): string {
  if (session.info.agentKind !== 'pi' || !piExtensionPath) return command;
  if (/\s--extension(?:\s|=)/.test(command)) return command;
  // Launch commands are generated by the provider adapter (pi [--session ...]).
  // Only inject into a plain Pi executable; arbitrary shell commands remain untouched.
  return command.replace(/^(\s*(?:(?:env)\s+)?(?:pi|[^\s/]+\/pi))(?=\s|$)/, `$1 --extension ${quoteShell(piExtensionPath)}`);
}

function startupShellArgs(
  shell: string,
  command: string,
  delivery: TerminalInfo['startupCommandDelivery'],
  launchToken?: string,
): string[] {
  if (process.platform === 'win32' || /(?:cmd|powershell)/i.test(shell)) {
    return ['/d', '/s', '/c', command];
  }
  const marker = delivery === 'shell-ready'
    ? "printf '\\033]777;bohemian-shell-ready\\007'; "
    : '';
  const token = launchToken ? `export BOHEMIAN_AGENT_LAUNCH_TOKEN=${quoteShell(launchToken)}; ` : '';
  return ['-lc', `${marker}${token}exec ${command}`];
}

function quoteShell(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
function normalizeSize(size?: { cols: number; rows: number }): { cols: number; rows: number } {
  return {
    cols: Math.max(2, Math.min(500, Math.floor(size?.cols ?? 80))),
    rows: Math.max(1, Math.min(300, Math.floor(size?.rows ?? 24))),
  };
}

function clampLimit(value: number, fallback: number, max: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(value)));
}
