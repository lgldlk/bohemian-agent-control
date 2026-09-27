import fs from 'fs';
import os from 'os';
import path from 'path';
import { HttpError } from '../http/errors';

export function homeRoot(): string {
  return os.homedir();
}

export function resolveUnderHome(input: string): string {
  const home = homeRoot();
  const resolved = path.resolve(input || home);
  const homeWithSep = home.endsWith(path.sep) ? home : home + path.sep;
  if (resolved !== home && !resolved.startsWith(homeWithSep)) {
    throw new HttpError(400, 'path outside home', 'path_forbidden');
  }
  return resolved;
}

export function listHomeDir(input: string) {
  const dir = resolveUnderHome(input);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new HttpError(404, '不是文件夹', 'not_dir');
  }
  const home = homeRoot();
  const parent = dir === home ? null : path.dirname(dir);
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith('.'))
    .map((d) => ({ name: d.name, path: path.join(dir, d.name) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { path: dir, parent, home, entries };
}
