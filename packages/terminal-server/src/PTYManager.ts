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
import {
  createTerminalBufferModel,
  truncateTerminalTail,
  type TerminalBufferModel,
} from './terminalScreenMode';
import { writePiStatusExtension } from './agents/pi/statusExtension';
import { prepareProviderHookRuntime, type ProviderHookRuntime } from './agents/hookRuntime';
import { listClaudeSessionHeaders } from './agents/claude/sessions';
import { syncClaudeSessions } from './agents/claude/sync';
import { listCodexSessionHeaders } from './agents/codex/sessions';
import { syncCodexSessions } from './agents/codex/sync';
import { journalTurnUpdate, screenTurnUpdate } from './agents/turnUpdate';
import { listPiSessionHeaders } from './agents/pi/sessions';
import { type TurnCursor } from './agents/journal';
import { providerResumeCommand, providerStartupCommand } from './agents/startupCommand';
import { selectLaunchSession, type SessionHeader } from './agents/sessionMatch';
import { applySessionIdentity, providerStatusSessionAction } from './agents/sessionIdentity';
import {
  agentSessionIdForShell,
  hasTmuxSession,
  hideTmuxStatus,
  killPtyTree,
  killTmuxSession,
  tmuxAvailable,
  tmuxName,
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
  enableProviderHooks?: boolean;
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
  codexTurn?: TurnCursor;
  codexWatch?: fs.FSWatcher;
  claudeTurn?: TurnCursor;
  claudeWatch?: fs.FSWatcher;
  piTurn?: TurnCursor;
  piWatch?: fs.FSWatcher;
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
  private readonly stateLockPath: string;
  private readonly agentTimer: NodeJS.Timeout;
  private readonly persistentSessions: boolean;
  private readonly tmuxCommand: string;
  private readonly tmuxSocket: string;
  private readonly hookWsUrl?: string;
  private readonly hookToken?: string;
  private readonly piStatusExtensionPath?: string;
  private readonly providerHookRuntime?: ProviderHookRuntime;
  private disposing = false;

  constructor(options: PTYManagerOptions = {}) {
    this.stateDir = options.stateDir ?? path.join(os.homedir(), '.bohemian-agent-control', 'terminals');
    this.stateLockPath = path.join(this.stateDir, '.server.lock');
    this.maxSessions = options.maxSessions ?? 50;
    this.maxScrollbackChars = options.maxScrollbackChars ?? 1_000_000;
    this.maxPendingOutputChars = Math.min(this.maxScrollbackChars, 64_000);
    this.tmuxCommand = options.tmuxCommand ?? process.env.TMUX_COMMAND ?? 'tmux';
    this.tmuxSocket = path.join(this.stateDir, '.tmux.sock');
    this.hookWsUrl = options.hookWsUrl;
    this.hookToken = options.hookToken;
    fs.mkdirSync(this.stateDir, { recursive: true, mode: 0o700 });
    this.acquireStateLock();
    if (options.enableAgentHooks !== false) {
      try {
        this.piStatusExtensionPath = writePiStatusExtension(path.join(this.stateDir, 'agent-hooks', 'pi'));
      } catch (error) {
        console.warn(`[PTY] ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (options.enableProviderHooks !== false && options.enableAgentHooks !== false) {
      try {
        this.providerHookRuntime = prepareProviderHookRuntime(this.stateDir, process.execPath);
      } catch (error) {
        console.warn(`[PTY] Provider hook runtime unavailable: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.persistentSessions = options.persistentSessions ?? tmuxAvailable(this.tmuxCommand, this.tmuxSocket);
    if (this.persistentSessions && !tmuxAvailable(this.tmuxCommand, this.tmuxSocket)) {
      console.warn(`[PTY] tmux not found; terminal processes cannot be reattached after a server restart`);
    }
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
    const boundSessionId = session.info.agentSessionId
      || (session.info.nodeId
        && !session.info.nodeId.startsWith('pending-')
        && session.info.nodeId !== session.info.launchId
        ? session.info.nodeId
        : undefined);
    const resumeCommand = providerResumeCommand(session.info.agentKind, boundSessionId);
    if (resumeCommand) {
      session.info.startupCommand = resumeCommand;
      session.info.startupCommandDelivery ??= 'shell-ready';
      session.info.startupStatus = 'pending';
    }
    this.appendScrollback(session, '\r\n\x1b[90m--- terminal restarted ---\x1b[0m\r\n');
    session.info.status = 'starting';
    session.info.incarnationId = crypto.randomUUID();
    session.info.agentStatus = undefined;
    session.info.agentDetail = undefined;
    session.info.agentSessionId = undefined;
    session.codexWatch?.close();
    session.codexWatch = undefined;
    session.codexTurn = undefined;
    session.claudeWatch?.close();
    session.claudeWatch = undefined;
    session.claudeTurn = undefined;
    session.piWatch?.close();
    session.piWatch = undefined;
    session.piTurn = undefined;
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
          providerStartupCommand(session.info.agentKind, session.info.startupCommand, {
            piExtensionPath: this.piStatusExtensionPath,
            claudeSettingsPath: this.providerHookRuntime?.claudeSettingsPath,
            codexHomePath: this.providerHookRuntime?.codexHomePath,
          }),
          session.info.startupCommandDelivery,
          {
            BOHEMIAN_TERMINAL_ID: session.id,
            ...(session.info.launchToken ? { BOHEMIAN_AGENT_LAUNCH_TOKEN: session.info.launchToken } : {}),
            ...(session.info.agentKind ? { BOHEMIAN_AGENT_KIND: session.info.agentKind } : {}),
            ...(this.hookWsUrl ? { BOHEMIAN_TERMINAL_WS_URL: this.hookWsUrl } : {}),
            ...(this.hookToken ? { BOHEMIAN_TERMINAL_TOKEN: this.hookToken } : {}),
          },
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
        ...(session.info.agentKind === 'codex' && this.providerHookRuntime?.codexHomePath
          ? { CODEX_HOME: this.providerHookRuntime.codexHomePath }
          : {}),
        BOHEMIAN_TERMINAL_ID: session.id,
        ...(session.info.agentKind ? { BOHEMIAN_AGENT_KIND: session.info.agentKind } : {}),
        ...(session.info.launchToken ? { BOHEMIAN_AGENT_LAUNCH_TOKEN: session.info.launchToken } : {}),
        ...(this.hookWsUrl ? { BOHEMIAN_TERMINAL_WS_URL: this.hookWsUrl } : {}),
        ...(this.hookToken ? { BOHEMIAN_TERMINAL_TOKEN: this.hookToken } : {}),
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      } as Record<string, string>,
    });
    session.process = processHandle;
    session.info.pid = processHandle.pid;
    // New sessions inherit the board-wide tmux defaults applied in the
    // constructor. Re-running the full tmux setup here starts several
    // synchronous child processes for every blank terminal and delays the
    // create RPC before the UI can even mount the terminal.
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
      session.normalScrollback = truncateTerminalTail(
        `${session.normalScrollback}${bufferChunk.normal}`,
        this.maxScrollbackChars,
      );
    }
    if (bufferChunk.mode === 'alternate') {
      if (previousMode === 'normal') session.alternateFrame = bufferChunk.alternate;
      else {
        session.alternateFrame = truncateTerminalTail(
          `${session.alternateFrame}${bufferChunk.alternate}`,
          this.maxScrollbackChars,
        );
      }
    } else if (previousMode === 'alternate' && bufferChunk.alternate) {
      session.alternateFrame = truncateTerminalTail(
        `${session.alternateFrame}${bufferChunk.alternate}`,
        this.maxScrollbackChars,
      );
    }
    if (session.info.alternateScreen !== (bufferChunk.mode === 'alternate')) {
      session.info.alternateScreen = bufferChunk.mode === 'alternate';
      session.info.updatedAt = Date.now();
      this.schedulePersist(session);
      this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    }
    for (const payload of processed.payloads) {
      const action = providerStatusSessionAction(session.info.agentSessionId, payload);
      if (action === 'stale') continue;
      const now = Date.now();
      session.info.agentDetail = { ...payload, origin: 'osc', observedAt: now };
      if (action === 'adopt' && payload.providerSessionId) this.adoptProviderSession(session, payload.providerSessionId);
      session.info.agentStatus = payload.state === 'working' ? 'working' : payload.state === 'blocked' ? 'blocked' : 'idle';
      session.info.updatedAt = now;
      this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    }
    if (!processed.cleanData) {
      this.schedulePersist(session);
      return;
    }
    this.observeAgentTitles(session, processed.cleanData);
    this.observeProviderScreen(session, processed.cleanData);
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

  private observeProviderScreen(session: PTYSession, data: string): void {
    const next = screenTurnUpdate(session.info.agentKind, data, session.info.agentDetail);
    if (!next || session.info.agentStatus === next.status) return;
    session.info.agentDetail = {
      state: next.state,
      origin: 'screen',
      observedAt: next.observedAt,
      providerSessionId: session.info.agentSessionId,
    };
    session.info.agentStatus = next.status;
    session.info.updatedAt = Date.now();
    this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
  }

  private appendScrollback(session: PTYSession, data: string): void {
    session.sequence += 1;
    session.scrollback += data;
    if (session.scrollback.length > this.maxScrollbackChars) {
      session.scrollback = truncateTerminalTail(session.scrollback, this.maxScrollbackChars);
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
    const data = session.pendingOutput.join('');
    const sourceStart = session.pendingOutputStart ?? session.outputOffset - Buffer.byteLength(data, 'utf8');
    const sourceEnd = sourceStart + Buffer.byteLength(data, 'utf8');
    session.pendingOutput = [];
    session.pendingOutputBytes = 0;
    session.pendingOutputStart = null;
    const droppedOutput = session.droppedOutput;
    session.droppedOutput = false;
    session.inFlightSequence = session.sequence;
    for (const callback of session.subscribers) {
      callback(data, session.sequence, sourceEnd - sourceStart, droppedOutput, sourceStart, sourceEnd);
    }
  }

  subscribe(
    id: TerminalId,
    callback: (data: string, sequence: number, bytes: number, droppedOutput: boolean, sourceStart: number, sourceEnd: number) => void,
  ): () => void {
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

  applyAgentStatus(id: TerminalId, launchToken: string, payload: ParsedAgentStatus): boolean {
    const session = this.sessions.get(id);
    if (!session || !session.info.launchToken || session.info.launchToken !== launchToken) return false;
    const action = providerStatusSessionAction(session.info.agentSessionId, payload);
    if (action === 'stale') return true;
    const now = Date.now();
    session.info.agentDetail = { ...payload, origin: 'hook', observedAt: now };
    session.info.agentStatus = payload.state === 'working' ? 'working' : payload.state === 'blocked' || payload.state === 'waiting' ? 'blocked' : 'idle';
    if (action === 'adopt' && payload.providerSessionId) this.adoptProviderSession(session, payload.providerSessionId);
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
    session.codexWatch?.close();
    session.claudeWatch?.close();
    session.piWatch?.close();
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

  private persistedMetadata(session: PTYSession): { metadata: PersistedSession; scrollback: string } {
    return {
      scrollback: session.scrollback,
      metadata: {
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
      },
    };
  }

  /**
   * Blocking write used only while shutting down. The async writer can lose the
   * race against process exit, and a lost archive is exactly what makes an
   * Agent terminal unrecoverable after a restart. The tmux pane may be
   * repainting as the attach client detaches, so a recovered archive keeps its
   * previously persisted scrollback instead of capturing that final frame.
   */
  private persistSync(session: PTYSession): void {
    const files = this.paths(session.id);
    const { metadata, scrollback } = this.persistedMetadata(session);
    try {
      const existing = fs.existsSync(files.meta)
        ? (JSON.parse(fs.readFileSync(files.meta, 'utf8')) as unknown)
        : null;
      fs.writeFileSync(files.meta, JSON.stringify(metadata), { mode: 0o600 });
      if (!existing) fs.writeFileSync(files.log, scrollback, { mode: 0o600 });
    } catch (error) {
      console.warn(`[PTY] Failed to persist ${session.id} on shutdown:`, error);
    }
  }

  private persist(session: PTYSession): void {
    if (session.closed) return;
    if (session.persistInFlight) {
      session.persistQueued = true;
      return;
    }

    const files = this.paths(session.id);
    const { metadata, scrollback } = this.persistedMetadata(session);
    const metadataText = JSON.stringify(metadata);
    // Every writer gets its own temporary files. A shared `${meta}.tmp`
    // allows two terminal-server processes to overwrite/rename each other's
    // buffers, producing a valid JSON prefix followed by raw terminal output.
    const suffix = `${process.pid}-${crypto.randomUUID()}`;
    const temporaryMeta = `${files.meta}.${suffix}.tmp`;
    const temporaryLog = `${files.log}.${suffix}.tmp`;
    let write: Promise<void>;
    write = (async () => {
      await fsp.writeFile(temporaryMeta, metadataText, { mode: 0o600 });
      await fsp.rename(temporaryMeta, files.meta);
      await fsp.writeFile(temporaryLog, scrollback, { mode: 0o600 });
      await fsp.rename(temporaryLog, files.log);
    })()
      .catch((error) => {
        console.warn(`[PTY] Failed to persist ${session.id}:`, error);
      })
      .finally(() => {
        void fsp.rm(temporaryMeta, { force: true }).catch(() => {});
        void fsp.rm(temporaryLog, { force: true }).catch(() => {});
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
        const raw = fs.readFileSync(path.join(this.stateDir, name), 'utf8');
        const parsed = parsePersistedSession(raw);
        const metadata = parsed.value;
        if (!metadata.info?.id) continue;
        const files = this.paths(metadata.info.id);
        const scrollback = fs.existsSync(files.log) ? fs.readFileSync(files.log, 'utf8') : '';
        const tmuxAlive = Boolean(
          this.persistentSessions
          && metadata.tmuxSession
          && hasTmuxSession(metadata.tmuxSession, this.tmuxCommand, this.tmuxSocket),
        );
        // Resume only a terminal whose process really survived the restart.
        // A stale archive that merely says "running" is history, not a live
        // session; replaying all of them would relaunch every past Agent.
        const shouldRecoverAgent = Boolean(
          this.persistentSessions
          && !tmuxAlive
          && metadata.tmuxSession
          && metadata.info.status === 'running'
          && this.prepareAgentRecovery(metadata.info),
        );
        const recoverable = tmuxAlive;
        const info: TerminalInfo = {
          ...metadata.info,
          incarnationId: shouldRecoverAgent ? crypto.randomUUID() : (metadata.info.incarnationId ?? crypto.randomUUID()),
          status: recoverable ? 'running' : shouldRecoverAgent ? 'running' : 'exited',
          updatedAt: metadata.info.updatedAt ?? metadata.info.createdAt,
        };
        delete info.pid;
        if (!recoverable && !shouldRecoverAgent) {
          info.agentStatus = undefined;
          info.agentDetail = undefined;
        }
        const bufferMode = createTerminalBufferModel();
        bufferMode.feed(scrollback);
        const session: PTYSession = {
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
          droppedOutput: false,
          inFlightSequence: 0,
          inFlightBytes: 0,
          lastAckedSequence: 0,
          sequence: metadata.sequence ?? 0,
          scrollback: truncateTerminalTail(scrollback, this.maxScrollbackChars),
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
        };
        this.sessions.set(info.id, session);
        if (shouldRecoverAgent) {
          this.startProcess(session, [], undefined, false);
        } else if (!recoverable) {
          // The archive is historical. Drop the live flags so the UI shows a
          // stopped terminal with restorable history instead of a ghost.
          this.persist(session);
        }
        if (parsed.recovered) {
          console.warn(`[PTY] Recovered terminal archive ${name}`);
          this.schedulePersist(session);
        }
      } catch (error) {
        console.warn(`[PTY] Ignoring corrupt terminal archive ${name}:`, error);
      }
    }
  }

  /** Attach to tmux sessions that survived the restart. Archive decisions
   * (recover / mark exited) already happened in restoreArchivedSessions. */
  private restoreLiveSessions(): void {
    for (const session of this.sessions.values()) {
      if (session.info.status !== 'running' || !session.tmuxSession) continue;
      if (session.process) continue;
      if (!hasTmuxSession(session.tmuxSession, this.tmuxCommand, this.tmuxSocket)) continue;
      this.startProcess(session, [], undefined, true);
    }
  }

  private prepareAgentRecovery(info: TerminalInfo): boolean {
    const sessionId = info.agentSessionId
      || (info.nodeId && !info.nodeId.startsWith('pending-') && info.nodeId !== info.launchId ? info.nodeId : undefined);
    const command = providerResumeCommand(info.agentKind, sessionId);
    if (!command) return false;
    info.startupCommand = command;
    info.startupCommandDelivery = 'shell-ready';
    info.startupStatus = 'pending';
    info.status = 'running';
    info.agentStatus = undefined;
    info.agentDetail = undefined;
    delete info.exitCode;
    delete info.pid;
    return true;
  }

  private async refreshAgentBindings(): Promise<void> {
    const running = [...this.sessions.values()].filter((session) => session.info.status === 'running');
    const piHeaders = new Map<string, SessionHeader[]>();
    const codexHeaders = new Map<string, SessionHeader[]>();
    const claudeHeaders = new Map<string, SessionHeader[]>();
    const cwds = [...new Set(running.map((session) => session.info.cwd).filter(Boolean))];
    await Promise.all(cwds.map(async (cwd) => {
      const kinds = new Set(running.filter((session) => session.info.cwd === cwd).map((session) => session.info.agentKind));
      if (kinds.has('pi')) piHeaders.set(cwd, await listPiSessionHeaders(cwd));
      if (kinds.has('codex')) codexHeaders.set(cwd, await listCodexSessionHeaders(cwd));
      if (kinds.has('claude-code')) claudeHeaders.set(cwd, await listClaudeSessionHeaders(cwd));
    }));
    const claimed = new Set<string>();
    const ordered = [...running].sort((a, b) => a.info.createdAt - b.info.createdAt);
    for (const session of ordered) {
      const currentSessionId = session.info.agentSessionId;
      // Process arguments and launch-time headers are fallback correlation only.
      // After `/new` or `/resume`, they may still name the previous topic.
      if (currentSessionId) {
        claimed.add(currentSessionId);
        continue;
      }

      const launched = session.info.launchId?.startsWith('pending-') === true;
      let sessionId = await agentSessionIdForShell(session.info.pid);
      if (!sessionId && launched) {
        const headers = session.info.agentKind === 'pi'
          ? piHeaders
          : session.info.agentKind === 'codex'
            ? codexHeaders
            : session.info.agentKind === 'claude-code'
              ? claudeHeaders
              : undefined;
        if (headers) sessionId = selectLaunchSession(headers.get(session.info.cwd) ?? [], session.info.createdAt, claimed);
      }
      if (!sessionId) continue;
      claimed.add(sessionId);
      if (!this.applyLaunchIdentity(session, sessionId, launched && (session.info.agentKind === 'pi' || session.info.agentKind === 'codex' || session.info.agentKind === 'claude-code'))) continue;
      session.info.updatedAt = Date.now();
      this.schedulePersist(session);
      this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
    }
    const publish = (session: PTYSession, cursor: TurnCursor) => this.publishJournalTurn(session, cursor);
    const open = this.sessions.values();
    await syncCodexSessions(open, publish);
    await syncClaudeSessions(open, publish);
  }

  private publishJournalTurn(session: PTYSession, cursor: TurnCursor): void {
    const next = journalTurnUpdate(cursor, session.info.agentDetail);
    if (!next) return;
    session.info.agentDetail = {
      state: next.state,
      origin: 'journal',
      observedAt: next.observedAt,
      providerSessionId: session.info.agentSessionId,
    };
    session.info.agentStatus = next.status;
    session.info.updatedAt = Date.now();
    this.schedulePersist(session);
    this.emit({ type: 'updated', terminal: this.cloneInfo(session.info) });
  }

  private adoptProviderSession(session: PTYSession, providerSessionId: string): void {
    this.applyLaunchIdentity(session, providerSessionId, true);
  }

  private applyLaunchIdentity(session: PTYSession, sessionId: string, forceNode: boolean): boolean {
    const update = applySessionIdentity(session.info, sessionId, forceNode);
    if (update.sessionChanged) this.resetAgentSessionTracking(session);
    return update.changed;
  }

  private resetAgentSessionTracking(session: PTYSession): void {
    session.codexWatch?.close();
    session.codexWatch = undefined;
    session.codexTurn = undefined;
    session.claudeWatch?.close();
    session.claudeWatch = undefined;
    session.claudeTurn = undefined;
    session.piWatch?.close();
    session.piWatch = undefined;
    session.piTurn = undefined;
  }

  async dispose(): Promise<void> {
    if (this.disposing) return;
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
        // Persist before detaching the client. tmux can emit a final "lost tty"
        // repaint while the attach process exits; that frame must not replace
        // the useful Agent scrollback in the archive.
        this.persistSync(session);
        try { session.process?.kill(); } catch { /* already exited */ }
        session.process = null;
      } else {
        try { session.process?.kill(); } catch { /* already exited */ }
        session.process = null;
        session.info.status = 'exited';
        session.info.updatedAt = Date.now();
        delete session.info.pid;
        this.persistSync(session);
      }

      session.closed = true;
      if (session.persistInFlight) pending.push(session.persistInFlight);
    }
    await Promise.all(pending);
    this.eventSubscribers.clear();
    this.releaseStateLock();
  }

  private acquireStateLock(): void {
    try {
      const fd = fs.openSync(this.stateLockPath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), 'utf8');
      fs.closeSync(fd);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }

    let owner: { pid?: number } = {};
    try {
      owner = JSON.parse(fs.readFileSync(this.stateLockPath, 'utf8')) as { pid?: number };
    } catch {
      // A crashed writer may have left an empty lock. It is safe to replace
      // only when no live owner can be established.
    }
    if (owner.pid && isProcessAlive(owner.pid)) {
      throw new Error(`Terminal state directory is already in use by PID ${owner.pid}`);
    }
    try {
      fs.rmSync(this.stateLockPath, { force: true });
      const fd = fs.openSync(this.stateLockPath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, startedAt: Date.now() }), 'utf8');
      fs.closeSync(fd);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new Error('Terminal state directory is already in use');
      }
      throw error;
    }
  }

  private releaseStateLock(): void {
    try {
      const owner = JSON.parse(fs.readFileSync(this.stateLockPath, 'utf8')) as { pid?: number };
      if (owner.pid !== process.pid) return;
    } catch {
      // The lock may already have been removed after a forced shutdown.
    }
    try { fs.rmSync(this.stateLockPath, { force: true }); } catch { /* ignore */ }
  }
}

function startupShellArgs(
  shell: string,
  command: string,
  delivery: TerminalInfo['startupCommandDelivery'],
  hookEnv: Record<string, string>,
): string[] {
  if (process.platform === 'win32' || /(?:cmd|powershell)/i.test(shell)) {
    return ['/d', '/s', '/c', command];
  }
  const marker = delivery === 'shell-ready'
    ? "printf '\\033]777;bohemian-shell-ready\\007'; "
    : '';
  // tmux does not pass the PTY environment into the session. Pi reads these
  // when its extension loads, so they have to be part of the exec command.
  const exported = Object.entries(hookEnv)
    .filter(([, value]) => value)
    .map(([key, value]) => `export ${key}=${quoteShell(value)}; `)
    .join('');
  return ['-lc', `${marker}${exported}exec ${command}`];
}

function parsePersistedSession(raw: string): { value: PersistedSession; recovered: boolean } {
  try {
    return { value: JSON.parse(raw) as PersistedSession, recovered: false };
  } catch (error) {
    // Older concurrent writers could append terminal bytes after a complete
    // metadata object. Recover the complete object instead of dropping the
    // live tmux-backed terminal from the inventory.
    const end = completeJsonObjectEnd(raw);
    if (end !== null) {
      try {
        return {
          value: JSON.parse(raw.slice(0, end)) as PersistedSession,
          recovered: raw.slice(end).trim().length > 0,
        };
      } catch {
        // Continue with escape repair below. A truncated `\uXXXX` sequence
        // inside the persisted scrollback can prevent the prefix from parsing.
      }
    }
    const repaired = repairJsonEscapes(raw);
    try {
      return { value: JSON.parse(repaired) as PersistedSession, recovered: true };
    } catch {
      const repairedEnd = completeJsonObjectEnd(repaired);
      if (repairedEnd === null) throw error;
      return {
        value: JSON.parse(repaired.slice(0, repairedEnd)) as PersistedSession,
        recovered: true,
      };
    }
  }
}

function repairJsonEscapes(raw: string): string {
  let result = '';
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (!inString) {
      if (char === '"') inString = true;
      result += char;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = false;
      result += char;
      continue;
    }
    if (escaped) {
      escaped = false;
      result += char;
      continue;
    }
    if (char !== '\\') {
      result += char;
      continue;
    }
    const next = raw[index + 1];
    const unicode = raw.slice(index + 2, index + 6);
    if (
      next === '"' || next === '\\' || next === '/' ||
      next === 'b' || next === 'f' || next === 'n' ||
      next === 'r' || next === 't' ||
      (next === 'u' && /^[0-9a-fA-F]{4}$/.test(unicode))
    ) {
      result += char;
      escaped = true;
      continue;
    }
    // Preserve the bytes as literal text by escaping the invalid slash.
    result += '\\\\';
  }
  return result;
}

function completeJsonObjectEnd(raw: string): number | null {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '{') {
      depth += 1;
      continue;
    }
    if (char === '}' && depth > 0) {
      depth -= 1;
      if (depth === 0) return index + 1;
    }
  }
  return null;
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
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
