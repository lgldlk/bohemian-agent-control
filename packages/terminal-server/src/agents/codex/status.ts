/** SessionStart changes topic on startup/resume/clear, but not compaction. */
export function isCodexSessionTransition(eventName: string, source: string): boolean {
  const event = eventName.toLowerCase();
  if (!event.includes('sessionstart') && !event.includes('session_start')) return false;
  return source.toLowerCase() !== 'compact';
}

/** Codex hook names. A child stop does not close the parent turn. */
export function classifyCodexHookEvent(eventName: string): 'working' | 'waiting' | 'done' | '' {
  const event = eventName.toLowerCase();
  if (!event) return '';
  if (event.includes('sessionstart') || event.includes('session_start')) return 'done';
  if (event.includes('permission') || event.includes('approval') || event.includes('question')) return 'waiting';
  if (event.includes('subagentstop') || event.includes('subagent_stop')) return 'working';
  if (
    event.includes('stop')
    || event.includes('complete')
    || event.includes('finish')
    || event.includes('idle')
    || event.includes('end')
    || event.includes('compact')
  ) return 'done';
  return 'working';
}

export const CODEX_HOOK_EVENTS = [
  'SessionStart',
  'SessionEnd',
  'UserPromptSubmit',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'SubagentStart',
  'SubagentStop',
  'Stop',
];
