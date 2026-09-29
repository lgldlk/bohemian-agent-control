import * as os from 'node:os';
import * as path from 'node:path';

export interface ApiConfig {
  host: string;
  port: number;
  piSessionDir?: string;
  codexCommand: string;
  codexHome: string;
  pluginRoot: string;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

function num(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const level = env.LOG_LEVEL;
  return {
    host: env.API_HOST ?? '127.0.0.1',
    port: num('API_PORT', 18721),
    piSessionDir: env.PI_SESSION_DIR || undefined,
    codexCommand: env.CODEX_COMMAND ?? 'codex',
    codexHome: env.BOHEMIAN_CODEX_HOME ?? path.join(os.homedir(), '.bohemian-agent-control', 'terminals', 'agent-hooks', 'codex-home'),
    pluginRoot: env.BOHEMIAN_PLUGIN_DIR ?? path.join(os.homedir(), '.bohemian-agent-control', 'plugins'),
    logLevel: level === 'debug' || level === 'warn' || level === 'error' ? level : 'info',
  };
}
