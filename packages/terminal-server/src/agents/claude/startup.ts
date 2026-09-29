export function injectClaudeSettings(command: string, settingsPath?: string): string | undefined {
  if (!settingsPath || /\s--settings(?:\s|=)/.test(command)) return undefined;
  return command.replace(/^(\s*(?:(?:env)\s+)?(?:claude|[^\s/]+\/claude))(?=\s|$)/, `$1 --settings ${quote(settingsPath)}`);
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
