import { ensureLocalToken, localTokenPath } from './localAuth';
import { PTYManager } from './PTYManager';
import { TerminalWebSocketServer } from './WebSocketServer';

export { PTYManager } from './PTYManager';
export { TerminalWebSocketServer } from './WebSocketServer';

export interface TerminalServerOptions {
  wsPort?: number;
  wsHost?: string;
  stateDir?: string;
  maxSessions?: number;
  maxScrollbackChars?: number;
  token?: string;
  allowedOrigins?: readonly string[];
  enableAgentHooks?: boolean;
}

/**
 * 启动终端服务器
 * 包含 PTY 管理器和 WebSocket 服务器
 */
export function startTerminalServer(options: TerminalServerOptions = {}): {
  ptyManager: PTYManager;
  wsServer: TerminalWebSocketServer;
  close: () => Promise<void>;
} {
  const wsPort = options.wsPort ?? 18722;
  const wsHost = options.wsHost ?? '127.0.0.1';
  const token = options.token ?? ensureLocalToken('terminal.token');

  const ptyManager = new PTYManager({
    stateDir: options.stateDir,
    maxSessions: options.maxSessions,
    maxScrollbackChars: options.maxScrollbackChars,
    hookWsUrl: `ws://${wsHost}:${wsPort}`,
    hookToken: token,
    enableAgentHooks: options.enableAgentHooks,
  });
  const wsServer = new TerminalWebSocketServer({
    port: wsPort,
    host: wsHost,
    ptyManager,
    token,
    allowedOrigins: options.allowedOrigins,
  });

  console.log(`[Terminal Server] Started on ws://${wsHost}:${wsPort}`);
  console.log(`[Terminal Server] Auth token file ${localTokenPath('terminal.token')}`);

  return {
    ptyManager,
    wsServer,
    close: async () => {
      wsServer.close();
      await ptyManager.dispose();
    },
  };
}
