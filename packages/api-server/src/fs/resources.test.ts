import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  importResource,
  importResourceStream,
  parseResourceByteRange,
  readResource,
  resolveResourcePath,
  statResource,
  streamResource,
} from './resources';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe('resource filesystem access', () => {
  it('resolves and reads files under the home directory', () => {
    const root = fs.mkdtempSync(path.join(os.homedir(), '.bohemian-resource-test-'));
    roots.push(root);
    const file = path.join(root, 'result.png');
    fs.writeFileSync(file, 'not really an image');
    expect(resolveResourcePath('./result.png', root, [root])).toBe(file);
    expect(statResource(file, root, [root]).previewKind).toBe('image');
  });

  it('reads text files with metadata', () => {
    const root = fs.mkdtempSync(path.join(os.homedir(), '.bohemian-resource-test-'));
    roots.push(root);
    fs.writeFileSync(path.join(root, 'README.md'), '# hello');
    expect(readResource('README.md', root, [root]).content).toBe('# hello');
  });

  it('allows the exact requested file under the current-user temp directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-clipboard-test-'));
    roots.push(root);
    const file = path.join(root, 'pi-clipboard-example.png');
    fs.writeFileSync(file, 'clipboard image');
    expect(resolveResourcePath(file, os.homedir(), [])).toBe(fs.realpathSync(file));
    expect(statResource(file, os.homedir(), []).previewKind).toBe('image');
  });

  it('imports dropped bytes into a content-addressed managed path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-import-test-'));
    roots.push(root);
    const first = await importResource('../preview image.png', Buffer.from('png bytes'), 'image/png', root);
    const second = await importResource('preview image.png', Buffer.from('png bytes'), 'image/png', root);
    expect(first.path).toBe(second.path);
    expect(first.name).toBe('preview image.png');
    expect(first.cwd).toContain(root);
    expect(first.previewKind).toBe('image');
    expect(fs.readFileSync(first.path, 'utf8')).toBe('png bytes');
  });

  it('streams imported chunks without buffering the complete file', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-import-stream-test-'));
    roots.push(root);
    const imported = await importResourceStream('stream.txt', (async function* () {
      yield Buffer.from('first ');
      yield Buffer.from('second');
    })(), 'text/plain', root, 100);
    expect(fs.readFileSync(imported.path, 'utf8')).toBe('first second');
  });

  it('rejects imported files above the configured resource size limit', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-import-limit-test-'));
    roots.push(root);
    await expect(importResource('large.bin', Buffer.alloc(11), undefined, root, 10))
      .rejects.toThrow('文件过大');
  });

  it('streams byte ranges for large media seeking', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-range-test-'));
    roots.push(root);
    const file = path.join(root, 'video.mp4');
    fs.writeFileSync(file, '0123456789');
    expect(parseResourceByteRange('bytes=2-5', 10)).toEqual({ start: 2, end: 5 });
    expect(parseResourceByteRange('bytes=-3', 10)).toEqual({ start: 7, end: 9 });
    const result = streamResource(file, root, [root], 'bytes=2-5');
    expect(result.contentLength).toBe(4);
    expect(result.range).toEqual({ start: 2, end: 5 });
    const chunks: Buffer[] = [];
    for await (const chunk of result.stream) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks).toString()).toBe('2345');
  });

  it('rejects a temp symlink whose real target escapes the temp directory', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-clipboard-link-test-'));
    const outside = fs.mkdtempSync(path.join(os.homedir(), '.bohemian-resource-secret-'));
    roots.push(root, outside);
    const secret = path.join(outside, 'secret.txt');
    const link = path.join(root, 'pi-clipboard-secret.txt');
    fs.writeFileSync(secret, 'secret');
    fs.symlinkSync(secret, link);
    expect(() => resolveResourcePath(link, os.homedir(), [])).toThrow('path outside allowed roots');
  });

  it('rejects a symlink escaping home', () => {
    const root = fs.mkdtempSync(path.join(os.homedir(), '.bohemian-resource-test-'));
    roots.push(root);
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'bohemian-resource-outside-'));
    roots.push(outside);
    fs.writeFileSync(path.join(outside, 'secret.txt'), 'secret');
    fs.symlinkSync(path.join(outside, 'secret.txt'), path.join(root, 'secret.txt'));
    expect(() => resolveResourcePath('secret.txt', root, [root])).toThrow();
  });
});
