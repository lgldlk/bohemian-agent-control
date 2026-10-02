export function injectPiExtension(command: string, extensionPath?: string): string | undefined {
  if (!extensionPath || /\s--extension(?:\s|=)/.test(command)) return undefined;
  return command.replace(/^(\s*(?:(?:env)\s+)?(?:pi|[^\s/]+\/pi))(?=\s|$)/, `$1 --extension ${quote(extensionPath)}`);
}

/**
 * Pi's regular TUI paints the normal buffer with cursor-addressed redraws and
 * does not enable terminal mouse reporting. In an embedded terminal that
 * means xterm has no rendered scrollback to expose. Fullscreen mode owns a
 * proper scroll view and enables SGR wheel reports, which keeps Pi's history
 * scrollable without flattening its screen into fake normal-buffer output.
 */
export function ensurePiFullscreen(command: string): string {
  if (!/(?:^|\s)(?:(?:env)\s+)?(?:pi|[^\s/]+\/pi)(?=\s|$)/.test(command)) return command;
  if (/(?:^|\s)--tui-mode(?:\s|=)/.test(command)) return command;
  return `${command} --tui-mode fullscreen`;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
