import { startTerminalServer } from './src/index';

const server = startTerminalServer({
  wsPort: 19123,
  wsHost: '127.0.0.1',
  stateDir: process.env.E2E_STATE_DIR,
  token: process.env.E2E_TOKEN,
  enableAgentHooks: false,
  enableProviderHooks: false,
});

const shutdown = async () => {
  await server.close();
  process.exit(0);
};
process.once('SIGTERM', () => void shutdown());
process.once('SIGINT', () => void shutdown());
