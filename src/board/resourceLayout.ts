import type { TerminalResourceKind } from '@bohemian/terminal-protocol';

export interface ResourceLayoutInput {
  kind: TerminalResourceKind;
  previewKind?: string;
}

export interface ResourceShapeSize {
  w: number;
  h: number;
}

export function defaultResourceShapeSize(resource: ResourceLayoutInput): ResourceShapeSize {
  if (resource.kind === 'remote-url') return { w: 1100, h: 720 };
  if (resource.kind === 'local-directory') return { w: 420, h: 240 };
  switch (resource.previewKind) {
    case 'audio': return { w: 720, h: 300 };
    case 'video':
    case 'pdf': return { w: 1000, h: 680 };
    case 'image': return { w: 900, h: 650 };
    case 'text': return { w: 900, h: 620 };
    default: return { w: 900, h: 620 };
  }
}

export function shouldExpandLegacyResourceShape(
  resource: ResourceLayoutInput & ResourceShapeSize,
): boolean {
  const recommended = defaultResourceShapeSize(resource);
  const legacyMaximum = resource.kind === 'remote-url'
    ? { w: 800, h: 560 }
    : resource.kind === 'local-directory'
      ? { w: 420, h: 240 }
      : { w: 720, h: 440 };
  return resource.w <= legacyMaximum.w
    && resource.h <= legacyMaximum.h
    && (resource.w < recommended.w || resource.h < recommended.h);
}
