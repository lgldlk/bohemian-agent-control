import { startTerminalServer } from './index';
import { printBanner } from './banner';

printBanner();
const server = startTerminalServer({
  wsPort: Number(process.env.TERMINAL_WS_PORT) || 18722,
  wsHost: process.env.TERMINAL_WS_HOST || '127.0.0.1',
  stateDir: process.env.TERMINAL_STATE_DIR,
  token: process.env.TERMINAL_TOKEN || undefined,
  maxSessions: Number(process.env.TERMINAL_MAX_SESSIONS) || 50,
  maxScrollbackChars: Number(process.env.TERMINAL_MAX_SCROLLBACK_CHARS) || 1_000_000,
  allowedOrigins: process.env.TERMINAL_ALLOWED_ORIGINS?.split(',').map((item) => item.trim()).filter(Boolean),
  enableAgentHooks: process.env.TERMINAL_ENABLE_AGENT_HOOKS !== '0',
  enableProviderHooks: process.env.TERMINAL_ENABLE_PROVIDER_HOOKS !== '0',});
let shuttingDown = false;
const shutdown = async () => {
  if (shuttingDown) return;
  shuttingDown = true;
  await server.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
