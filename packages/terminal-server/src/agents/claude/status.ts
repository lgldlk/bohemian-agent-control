export type HookActivity = 'working' | 'waiting' | 'done' | '';

/** SessionStart changes topic on startup/resume/clear/fork, but not compaction. */
export function isClaudeSessionTransition(eventName: string, source: string): boolean {
  const event = eventName.toLowerCase();
  if (!event.includes('sessionstart') && !event.includes('session_start')) return false;
  return source.toLowerCase() !== 'compact';
}

/** Claude hook names. A child stop does not close the parent turn. */
export function classifyClaudeHookEvent(eventName: string): HookActivity {
  const event = eventName.toLowerCase();
  if (!event) return '';
  if (event.includes('sessionstart') || event.includes('session_start')) return 'done';
  if (event.includes('permissiondenied') || event.includes('permission_denied')) return 'working';
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

export const CLAUDE_HOOK_EVENTS: Array<{ name: string; matcher?: string }> = [
  { name: 'SessionStart' },
  { name: 'SessionEnd' },
  { name: 'UserPromptSubmit' },
  { name: 'Stop' },
  { name: 'StopFailure' },
  { name: 'PreToolUse', matcher: '*' },
  { name: 'PostToolUse', matcher: '*' },
  { name: 'PostToolUseFailure', matcher: '*' },
  { name: 'PermissionRequest', matcher: '*' },
  { name: 'PermissionDenied', matcher: '*' },
  { name: 'PostCompact' },
  { name: 'SubagentStart' },
  { name: 'SubagentStop' },
];
