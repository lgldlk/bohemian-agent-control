#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || 'dist');
const html = await readFile(path.join(dist, 'index.html'), 'utf8');
const entry = html.match(/<script[^>]+src="([^"]+)"/)?.[1];
if (!entry) throw new Error('Could not find the entry script in dist/index.html');

const visited = new Set();
const initialFiles = [];
const queue = [entry];
while (queue.length) {
  const request = queue.shift();
  const file = path.join(dist, request.replace(/^\//, ''));
  if (visited.has(file)) continue;
  visited.add(file);
  const source = await readFile(file, 'utf8');
  initialFiles.push(file);
  for (const match of source.matchAll(/\bfrom\s*["']\.\/([^"']+)["']/g)) {
    queue.push(`/assets/${match[1]}`);
  }
}

const css = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)]
  .map((match) => path.join(dist, match[1].replace(/^\//, '')));
const files = [...initialFiles, ...css];
let raw = 0;
let gzip = 0;
for (const file of files) {
  const data = await readFile(file);
  raw += data.byteLength;
  gzip += gzipSync(data).byteLength;
}

const mb = (value) => `${(value / 1024).toFixed(1)} KB`;
console.log(`Initial assets: ${files.length}`);
console.log(`Initial raw:    ${mb(raw)}`);
console.log(`Initial gzip:   ${mb(gzip)}`);
console.log(`Entry:          ${entry}`);

const maxRaw = Number(process.env.PERF_MAX_INITIAL_RAW || 900 * 1024);
const maxGzip = Number(process.env.PERF_MAX_INITIAL_GZIP || 300 * 1024);
if (raw > maxRaw || gzip > maxGzip) {
  console.error(`Bundle budget exceeded (raw <= ${mb(maxRaw)}, gzip <= ${mb(maxGzip)})`);
  process.exitCode = 1;
}
