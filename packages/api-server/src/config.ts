export interface ApiConfig {
  host: string;
  port: number;
  piSessionDir?: string;
  codexCommand: string;
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
    logLevel: level === 'debug' || level === 'warn' || level === 'error' ? level : 'info',
  };
}
