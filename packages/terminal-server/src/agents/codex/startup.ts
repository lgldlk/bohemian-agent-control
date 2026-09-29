export function injectCodexHome(command: string, codexHomePath?: string): string | undefined {
  if (!codexHomePath || /\bCODEX_HOME=/.test(command)) return undefined;
  return `env CODEX_HOME=${quote(codexHomePath)} ${withNoDaemon(command)}`;
}

function withNoDaemon(command: string): string {
  if (/(?:^|\s)--no-daemon(?:\s|$)/.test(command)) return command;
  // The managed CODEX_HOME lives below the terminal state directory. Its
  // app-server socket can exceed macOS's Unix socket path limit, so board
  // terminals must run the TUI directly instead of using the daemon.
  return command.replace(
    /^(\s*(?:codex|[^\s/]+\/codex))(?=\s|$)/,
    '$1 --no-daemon',
  );
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
