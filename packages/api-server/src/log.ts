type Level = 'debug' | 'info' | 'warn' | 'error';

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export interface Logger {
  debug(msg: string, extra?: unknown): void;
  info(msg: string, extra?: unknown): void;
  warn(msg: string, extra?: unknown): void;
  error(msg: string, extra?: unknown): void;
}

export function createLogger(scope: string, min: Level = 'info'): Logger {
  const write = (level: Level, msg: string, extra?: unknown) => {
    if (RANK[level] < RANK[min]) return;
    const line = `${new Date().toISOString()} [${level}] [${scope}] ${msg}`;
    const payload = extra === undefined ? line : `${line} ${stringify(extra)}`;
    if (level === 'error') console.error(payload);
    else if (level === 'warn') console.warn(payload);
    else console.log(payload);
  };
  return {
    debug: (m, e) => write('debug', m, e),
    info: (m, e) => write('info', m, e),
    warn: (m, e) => write('warn', m, e),
    error: (m, e) => write('error', m, e),
  };
}

function stringify(extra: unknown): string {
  if (extra instanceof Error) return extra.stack ?? extra.message;
  try {
    return JSON.stringify(extra);
  } catch {
    return String(extra);
  }
}
