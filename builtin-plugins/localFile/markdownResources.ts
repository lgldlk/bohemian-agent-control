function directoryOf(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const index = normalized.lastIndexOf('/');
  return index <= 0 ? (normalized.startsWith('/') ? '/' : '.') : normalized.slice(0, index);
}

function decodePath(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

export function markdownImagePreviewUrl(
  source: string | undefined,
  markdownPath: string | undefined,
  fallbackCwd: string,
): string | undefined {
  if (!source) return undefined;
  const withoutFragment = source.split('#', 1)[0];
  if (!withoutFragment) return undefined;

  let imagePath = withoutFragment;
  if (/^https?:\/\//i.test(imagePath)) {
    try {
      const url = new URL(imagePath);
      return ['http:', 'https:'].includes(url.protocol) ? url.toString() : undefined;
    } catch {
      return undefined;
    }
  }
  if (imagePath.startsWith('//')) return `https:${imagePath}`;
  if (/^data:image\/(?:png|jpeg|gif|webp|svg\+xml);base64,/i.test(imagePath)) return imagePath;
  if (/^file:\/\//i.test(imagePath)) {
    try {
      const url = new URL(imagePath);
      if (url.hostname && url.hostname !== 'localhost') return undefined;
      imagePath = decodePath(url.pathname);
    } catch {
      return undefined;
    }
  } else if (/^[A-Za-z][A-Za-z0-9+.-]*:/i.test(imagePath)) {
    return undefined;
  } else {
    imagePath = decodePath(imagePath);
  }

  const cwd = markdownPath ? directoryOf(markdownPath) : fallbackCwd;
  return `/api/fs/preview?${new URLSearchParams({ path: imagePath, cwd }).toString()}`;
}
