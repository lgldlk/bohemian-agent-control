import { createHash } from 'node:crypto';
import { HttpError } from '../http/errors';
import {
  MAX_PLUGIN_FILE_BYTES,
  MAX_PLUGIN_MANIFEST_BYTES,
  MAX_PLUGIN_TOTAL_BYTES,
  USER_PLUGIN_MANIFEST_FILE,
  type DownloadedPluginPackage,
  type GitHubPluginLocation,
  type PluginFetch,
} from './contracts';
import {
  asRecord,
  decodeUserPluginManifest,
  normalizePluginRelativePath,
  requireShortString,
  validateGitHubName,
} from './validation';

const GITHUB_API_VERSION = '2022-11-28';
const DOWNLOAD_BATCH_SIZE = 4;

function decodeUrlSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    throw new HttpError(400, 'GitHub URL contains invalid escaping', 'invalid_github_url');
  }
}

export function parseGitHubPluginUrl(input: string): GitHubPluginLocation {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    throw new HttpError(400, 'Enter a valid GitHub repository URL', 'invalid_github_url');
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com' || url.username || url.password || url.port) {
    throw new HttpError(400, 'Only https://github.com repository URLs are supported', 'invalid_github_url');
  }
  const segments = url.pathname.split('/').filter(Boolean).map(decodeUrlSegment);
  if (segments.length < 2) throw new HttpError(400, 'GitHub repository URL is incomplete', 'invalid_github_url');
  const owner = validateGitHubName(segments[0], 'GitHub owner');
  const repository = validateGitHubName(segments[1].replace(/\.git$/i, ''), 'GitHub repository');
  let ref = url.searchParams.get('ref')?.trim() || undefined;
  let subdirectory = url.searchParams.get('path')?.trim() || '';
  const view = segments[2];
  if (view === 'tree') {
    if (segments.length < 4) throw new HttpError(400, 'GitHub tree URL is incomplete', 'invalid_github_url');
    ref = ref ?? segments[3];
    subdirectory = url.searchParams.has('path') ? subdirectory : segments.slice(4).join('/');
  } else if (view === 'blob') {
    if (segments.length < 5 || segments.at(-1) !== USER_PLUGIN_MANIFEST_FILE) {
      throw new HttpError(400, 'GitHub blob URL must point to plugin.json', 'invalid_github_url');
    }
    ref = ref ?? segments[3];
    subdirectory = url.searchParams.has('path') ? subdirectory : segments.slice(4, -1).join('/');
  } else if (view === 'releases') {
    throw new HttpError(400, 'GitHub release pages are not supported; use the repository or tree URL', 'invalid_github_url');
  } else if (view) {
    throw new HttpError(400, 'Use a repository, tree, or plugin.json GitHub URL', 'invalid_github_url');
  }
  if (ref) ref = requireShortString(ref, 'GitHub ref', 180);
  if (subdirectory) subdirectory = normalizePluginRelativePath(subdirectory, 'GitHub plugin path');
  const canonical = new URL(`https://github.com/${owner}/${repository}`);
  if (ref) canonical.searchParams.set('ref', ref);
  if (subdirectory) canonical.searchParams.set('path', subdirectory);
  return { owner, repository, ...(ref ? { ref } : {}), subdirectory, url: canonical.toString() };
}

export class GitHubPluginSource {
  constructor(
    private readonly fetcher: PluginFetch = globalThis.fetch,
    private readonly token = process.env.BOHEMIAN_GITHUB_TOKEN?.trim(),
  ) {}

  async download(inputUrl: string): Promise<DownloadedPluginPackage> {
    const location = parseGitHubPluginUrl(inputUrl);
    const { commit, ref } = await this.resolveCommit(location);
    const manifestPath = this.repositoryPath(location, USER_PLUGIN_MANIFEST_FILE);
    const manifestFile = await this.readFile(location, commit, manifestPath, MAX_PLUGIN_MANIFEST_BYTES);
    let rawManifest: unknown;
    try {
      rawManifest = JSON.parse(manifestFile.content.toString('utf8'));
    } catch {
      throw new HttpError(400, 'plugin.json is not valid JSON', 'invalid_plugin_manifest');
    }
    const manifest = decodeUserPluginManifest(rawManifest);
    const files = [] as DownloadedPluginPackage['files'];
    let totalBytes = 0;
    for (let index = 0; index < manifest.files.length; index += DOWNLOAD_BATCH_SIZE) {
      const batch = manifest.files.slice(index, index + DOWNLOAD_BATCH_SIZE);
      const downloaded = await Promise.all(batch.map(async (relativePath) => {
        const file = await this.readFile(
          location,
          commit,
          this.repositoryPath(location, relativePath),
          MAX_PLUGIN_FILE_BYTES,
        );
        const digest = createHash('sha256').update(file.content).digest('base64');
        const expected = manifest.integrity[relativePath];
        if (expected && expected !== `sha256-${digest}`) {
          throw new HttpError(400, `${relativePath} failed its SHA-256 integrity check`, 'plugin_integrity_mismatch');
        }
        return { path: relativePath, content: file.content, sha256: digest, githubBlobSha: file.githubBlobSha };
      }));
      for (const file of downloaded) {
        totalBytes += file.content.byteLength;
        if (totalBytes > MAX_PLUGIN_TOTAL_BYTES) {
          throw new HttpError(413, 'Plugin package is larger than 4 MiB', 'plugin_too_large');
        }
        files.push(file);
      }
    }
    return {
      manifest,
      source: {
        provider: 'github',
        owner: location.owner,
        repository: location.repository,
        ref,
        subdirectory: location.subdirectory,
        commit,
        url: location.url,
      },
      files,
    };
  }

  private repositoryPath(location: GitHubPluginLocation, relativePath: string): string {
    return location.subdirectory ? `${location.subdirectory}/${relativePath}` : relativePath;
  }

  private async resolveCommit(location: GitHubPluginLocation): Promise<{ commit: string; ref: string }> {
    let ref = location.ref;
    if (!ref) {
      const repository = asRecord(await this.requestJson(`/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}`));
      ref = typeof repository?.default_branch === 'string' ? repository.default_branch : undefined;
      if (!ref) throw new HttpError(502, 'GitHub repository has no default branch', 'github_error');
    }
    const commit = asRecord(await this.requestJson(
      `/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}/commits/${encodeURIComponent(ref)}`,
    ));
    const sha = typeof commit?.sha === 'string' && /^[0-9a-f]{40}$/i.test(commit.sha) ? commit.sha : '';
    if (!sha) throw new HttpError(502, 'GitHub did not return a valid commit', 'github_error');
    return { commit: sha, ref };
  }

  private async readFile(
    location: GitHubPluginLocation,
    commit: string,
    filePath: string,
    maxBytes: number,
  ): Promise<{ content: Buffer; githubBlobSha: string }> {
    const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
    const value = asRecord(await this.requestJson(
      `/repos/${encodeURIComponent(location.owner)}/${encodeURIComponent(location.repository)}/contents/${encodedPath}?ref=${encodeURIComponent(commit)}`,
    ));
    if (value?.type !== 'file' || value.encoding !== 'base64' || typeof value.content !== 'string') {
      throw new HttpError(400, `${filePath} must be a regular GitHub file no larger than 1 MiB`, 'invalid_plugin_file');
    }
    const declaredSize = typeof value.size === 'number' ? value.size : Number.NaN;
    if (!Number.isFinite(declaredSize) || declaredSize < 0 || declaredSize > maxBytes) {
      throw new HttpError(413, `${filePath} is too large`, 'plugin_file_too_large');
    }
    const content = Buffer.from(value.content.replace(/\s/g, ''), 'base64');
    if (content.byteLength !== declaredSize || content.byteLength > maxBytes) {
      throw new HttpError(400, `${filePath} has invalid content`, 'invalid_plugin_file');
    }
    const githubBlobSha = typeof value.sha === 'string' && /^[0-9a-f]{40}$/i.test(value.sha) ? value.sha : '';
    if (!githubBlobSha) throw new HttpError(502, 'GitHub did not return a valid file digest', 'github_error');
    return { content, githubBlobSha };
  }

  private async requestJson(apiPath: string): Promise<unknown> {
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'bohemian-agent-control-plugin-installer',
      'X-GitHub-Api-Version': GITHUB_API_VERSION,
    };
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let response: Response;
    try {
      response = await this.fetcher(`https://api.github.com${apiPath}`, {
        headers,
        redirect: 'follow',
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      const message = error instanceof Error && error.name === 'TimeoutError'
        ? 'GitHub request timed out'
        : 'Unable to reach GitHub';
      throw new HttpError(502, message, 'github_unavailable');
    }
    if (!response.ok) {
      if (response.status === 404) throw new HttpError(404, 'GitHub repository, ref, or plugin file was not found', 'github_not_found');
      if (response.status === 403 || response.status === 429) {
        throw new HttpError(429, 'GitHub API rate limit reached; try again later or configure BOHEMIAN_GITHUB_TOKEN', 'github_rate_limited');
      }
      throw new HttpError(502, `GitHub returned HTTP ${response.status}`, 'github_error');
    }
    try {
      return await response.json();
    } catch {
      throw new HttpError(502, 'GitHub returned an invalid response', 'github_error');
    }
  }
}
