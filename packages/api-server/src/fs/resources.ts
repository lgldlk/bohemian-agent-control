import fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HttpError } from '../http/errors';
import { homeRoot } from './homeDir';

const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const MAX_BINARY_BYTES = 2 * 1024 * 1024 * 1024;
export const MAX_RESOURCE_IMPORT_BYTES = MAX_BINARY_BYTES;

const MIME_TYPES: Record<string, string> = {
  '.aac': 'audio/aac',
  '.avif': 'image/avif',
  '.bmp': 'image/bmp',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.m4a': 'audio/mp4',
  '.md': 'text/markdown; charset=utf-8',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ts': 'text/typescript; charset=utf-8',
  '.tsx': 'text/typescript; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.webm': 'video/webm',
  '.webp': 'image/webp',
  '.yaml': 'text/yaml; charset=utf-8',
  '.yml': 'text/yaml; charset=utf-8',
};

const TEXT_EXTENSIONS = new Set([
  '.c', '.cc', '.cpp', '.csv', '.go', '.h', '.hpp', '.java', '.jsx', '.log', '.mjs', '.py',
  '.rb', '.rs', '.sh', '.sql', '.toml', '.vue', '.xml',
]);

export interface ImportedResource {
  name: string;
  path: string;
  cwd: string;
  size: number;
  mimeType?: string;
  previewKind: ResourceStat['previewKind'];
}

export interface ResourceByteRange {
  start: number;
  end: number;
}

export interface StreamedResource {
  stat: ResourceStat;
  stream: fs.ReadStream;
  range: ResourceByteRange | null;
  contentLength: number;
}

export interface ResourceStat {
  path: string;
  name: string;
  exists: true;
  isDirectory: boolean;
  size: number;
  modifiedAt: string;
  mimeType?: string;
  previewKind: 'image' | 'text' | 'audio' | 'video' | 'pdf' | 'binary' | 'directory';
}

export function resourceImportRoot(): string {
  return path.join(homeRoot(), '.bohemian-agent-control', 'imports');
}

function safeImportedName(rawName: string): string {
  const base = path.basename(rawName.replace(/\\/g, '/')).trim();
  const sanitized = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(-180);
  return sanitized && sanitized !== '.' && sanitized !== '..' ? sanitized : 'dropped-resource';
}

function isInside(root: string, target: string): boolean {
  const normalizedRoot = path.resolve(root);
  const normalizedTarget = path.resolve(target);
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}${path.sep}`);
}

function mimeType(filePath: string): string | undefined {
  return MIME_TYPES[path.extname(filePath).toLowerCase()];
}

function previewKind(filePath: string, directory: boolean): ResourceStat['previewKind'] {
  if (directory) return 'directory';
  const mime = mimeType(filePath) ?? '';
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('text/') || TEXT_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return 'text';
  return 'binary';
}

export function resolveResourcePath(rawPath: string, rawCwd?: string, allowedRoots: readonly string[] = []): string {
  const cwdInput = rawCwd?.trim() || homeRoot();
  const cwd = path.resolve(cwdInput.startsWith('~/') ? path.join(homeRoot(), cwdInput.slice(2)) : cwdInput);
  const expandedPath = rawPath.startsWith('~/') ? path.join(homeRoot(), rawPath.slice(2)) : rawPath;
  const candidate = path.isAbsolute(expandedPath) ? path.resolve(expandedPath) : path.resolve(cwd, expandedPath);
  const candidateAllowedRoots = allowedRoots.map((root) => path.resolve(root));
  const temporaryRoot = path.resolve(os.tmpdir());
  const temporaryCandidate = isInside(temporaryRoot, candidate);
  if (candidateAllowedRoots.length === 0 && !temporaryCandidate) {
    throw new HttpError(403, 'path outside allowed roots', 'path_forbidden');
  }
  if (!temporaryCandidate && !candidateAllowedRoots.some((root) => isInside(root, candidate))) {
    throw new HttpError(403, 'path outside allowed roots', 'path_forbidden');
  }
  const resolved = path.resolve(candidate);
  let realTarget: string;
  try {
    realTarget = fs.realpathSync(resolved);
  } catch {
    throw new HttpError(404, '文件不存在', 'not_found');
  }
  const realTemporaryRoot = temporaryCandidate
    ? fs.realpathSync(temporaryRoot)
    : temporaryRoot;
  const temporaryTargetAllowed = temporaryCandidate && isInside(realTemporaryRoot, realTarget);
  if (!temporaryTargetAllowed && !candidateAllowedRoots.some((root) => isInside(root, realTarget))) {
    throw new HttpError(403, 'path outside allowed roots', 'path_forbidden');
  }
  return realTarget;
}

export async function importResourceStream(
  rawName: string,
  source: AsyncIterable<Uint8Array | string>,
  suppliedMimeType?: string,
  importRoot = resourceImportRoot(),
  maxBytes = MAX_RESOURCE_IMPORT_BYTES,
): Promise<ImportedResource> {
  const root = path.resolve(importRoot);
  const stagingRoot = path.join(root, '.staging');
  const stagingPath = path.join(stagingRoot, randomUUID());
  await fsp.mkdir(stagingRoot, { recursive: true, mode: 0o700 });
  const handle = await fsp.open(stagingPath, 'wx', 0o600);
  const hash = createHash('sha256');
  let size = 0;
  try {
    for await (const chunk of source) {
      const buffer = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
      size += buffer.byteLength;
      if (size > maxBytes) throw new HttpError(413, '文件过大，无法导入', 'file_too_large');
      hash.update(buffer);
      let offset = 0;
      while (offset < buffer.byteLength) {
        const { bytesWritten } = await handle.write(buffer, offset);
        offset += bytesWritten;
      }
    }
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fsp.rm(stagingPath, { force: true }).catch(() => undefined);
    throw error;
  }
  await handle.close();

  const digest = hash.digest('hex');
  const cwd = path.join(root, digest.slice(0, 2), digest);
  const name = safeImportedName(rawName);
  const target = path.join(cwd, name);
  await fsp.mkdir(cwd, { recursive: true, mode: 0o700 });
  try {
    await fsp.link(stagingPath, target);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      await fsp.rm(stagingPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }
  await fsp.rm(stagingPath, { force: true });

  const stat = statResource(target, cwd, [root]);
  const mime = stat.mimeType ?? (/^[\w.+-]+\/[\w.+-]+$/.test(suppliedMimeType ?? '') ? suppliedMimeType : undefined);
  return {
    name,
    path: stat.path,
    cwd,
    size: stat.size,
    ...(mime ? { mimeType: mime } : {}),
    previewKind: stat.previewKind,
  };
}

export function importResource(
  rawName: string,
  data: Buffer,
  suppliedMimeType?: string,
  importRoot = resourceImportRoot(),
  maxBytes = MAX_RESOURCE_IMPORT_BYTES,
): Promise<ImportedResource> {
  return importResourceStream(rawName, (async function* () { yield data; })(), suppliedMimeType, importRoot, maxBytes);
}

export function statResource(rawPath: string, rawCwd?: string, allowedRoots: readonly string[] = []): ResourceStat {
  const target = resolveResourcePath(rawPath, rawCwd, allowedRoots);
  let stats: fs.Stats;
  try {
    stats = fs.statSync(target);
  } catch {
    throw new HttpError(404, '文件不存在', 'not_found');
  }
  if (!stats.isFile() && !stats.isDirectory()) {
    throw new HttpError(400, '不支持的文件类型', 'unsupported_file');
  }
  return {
    path: target,
    name: path.basename(target),
    exists: true,
    isDirectory: stats.isDirectory(),
    size: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    ...(mimeType(target) ? { mimeType: mimeType(target) } : {}),
    previewKind: previewKind(target, stats.isDirectory()),
  };
}

export function readResource(rawPath: string, rawCwd?: string, allowedRoots: readonly string[] = []): { stat: ResourceStat; content: string } {
  const stat = statResource(rawPath, rawCwd, allowedRoots);
  if (stat.isDirectory) throw new HttpError(400, '目录不能作为文件读取', 'not_file');
  if (stat.previewKind !== 'text') throw new HttpError(415, '该文件不支持文本预览', 'binary_file');
  if (stat.size > MAX_TEXT_BYTES) throw new HttpError(413, '文件过大，无法预览', 'file_too_large');
  return { stat, content: fs.readFileSync(stat.path, 'utf8') };
}

export function parseResourceByteRange(header: string | undefined, size: number): ResourceByteRange | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || size <= 0 || (!match[1] && !match[2])) {
    throw new HttpError(416, '无效的文件范围', 'invalid_range');
  }
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw new HttpError(416, '无效的文件范围', 'invalid_range');
    }
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start < 0 || start >= size || requestedEnd < start) {
    throw new HttpError(416, '无效的文件范围', 'invalid_range');
  }
  return { start, end: Math.min(requestedEnd, size - 1) };
}

export function streamResource(
  rawPath: string,
  rawCwd?: string,
  allowedRoots: readonly string[] = [],
  rangeHeader?: string,
): StreamedResource {
  const stat = statResource(rawPath, rawCwd, allowedRoots);
  if (stat.isDirectory) throw new HttpError(400, '目录不能作为文件读取', 'not_file');
  if (stat.size > MAX_BINARY_BYTES) throw new HttpError(413, '文件过大，无法预览', 'file_too_large');
  const range = parseResourceByteRange(rangeHeader, stat.size);
  return {
    stat,
    range,
    contentLength: range ? range.end - range.start + 1 : stat.size,
    stream: fs.createReadStream(stat.path, range ?? undefined),
  };
}

export function openResource(rawPath: string, rawCwd: string | undefined, allowedRoots: readonly string[], reveal: boolean): Promise<void> {
  const stat = statResource(rawPath, rawCwd, allowedRoots);
  const args = process.platform === 'darwin'
    ? reveal ? ['-R', stat.path] : [stat.path]
    : process.platform === 'win32'
      ? reveal ? ['/select,', stat.path] : [stat.path]
      : [stat.path];
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer.exe' : 'xdg-open';
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore', shell: false, detached: true });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
