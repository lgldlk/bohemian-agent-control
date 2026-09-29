/** Returns the stable folder dimension shared by board grouping and usage views. */
export function folderKeyOf(input: { workingDir?: string; project?: string }): string {
  const dir = (input.workingDir ?? '').trim().replace(/[\\/]+$/, '');
  if (dir) return dir;
  const project = (input.project ?? '').trim();
  return project ? `project:${project}` : '';
}
