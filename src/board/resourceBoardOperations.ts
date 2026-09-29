import { createShapeId, type Editor, type TLShapeId } from 'tldraw';
import type { TerminalResourceRef } from '@bohemian/terminal-protocol';
import { RESOURCE_SHAPE_TYPE, type ResourceShape } from './ResourceShape';
import { requestResourceFocus } from './resourceFocus';
import { defaultResourceShapeSize } from './resourceLayout';

const SENSITIVE_URL_PARAM = /(?:token|key|secret|password|passwd|auth|signature|credential|session|code)/i;

function remoteResourceUrls(resource: TerminalResourceRef): {
  url: string;
  displayUrl: string;
  sensitive: boolean;
} {
  const value = resource.url ?? resource.persistentUrl ?? '';
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
      return { url: '', displayUrl: '', sensitive: false };
    }
    const sensitive = resource.sensitive === true
      || Boolean(url.username || url.password)
      || [...url.searchParams.keys()].some((key) => SENSITIVE_URL_PARAM.test(key));
    return { url: url.toString(), displayUrl: url.toString(), sensitive };
  } catch {
    return { url: '', displayUrl: '', sensitive: false };
  }
}

export interface CreateResourceShapeOptions {
  x?: number;
  y?: number;
  focus?: boolean;
}

export function createResourceShape(
  editor: Editor,
  resource: TerminalResourceRef,
  options: CreateResourceShapeOptions = {},
): TLShapeId {
  const bounds = editor.getViewportPageBounds();
  const { w: width, h: height } = defaultResourceShapeSize({
    kind: resource.kind,
    previewKind: resource.previewKind,
  });
  const remoteUrls = resource.kind === 'remote-url'
    ? remoteResourceUrls(resource)
    : { url: '', displayUrl: '', sensitive: false };
  const identity = resource.kind === 'remote-url' ? remoteUrls.url : resource.path;
  const existing = editor.getCurrentPageShapes().find((shape) => {
    if (shape.type !== RESOURCE_SHAPE_TYPE) return false;
    const props = shape.props as { path?: string; url?: string; displayUrl?: string; resourceKind?: string };
    return resource.kind === 'remote-url'
      ? props.resourceKind === 'remote-url' && (
          (props.url ?? '') === identity
          || (props.displayUrl ?? props.url ?? '') === remoteUrls.displayUrl
        )
      : props.path === resource.path;
  });
  if (existing) {
    const props = existing.props as ResourceShape['props'];
    const line = resource.line ?? 0;
    const column = resource.column ?? 0;
    const endLine = resource.endLine ?? 0;
    const endColumn = resource.endColumn ?? 0;
    const targetChanged = (props.line ?? 0) !== line
      || (props.column ?? 0) !== column
      || (props.endLine ?? 0) !== endLine
      || (props.endColumn ?? 0) !== endColumn;
    const remoteChanged = resource.kind === 'remote-url' && (
      props.url !== remoteUrls.url
      || (props.displayUrl ?? props.url ?? '') !== remoteUrls.displayUrl
      || (props.sensitive ?? false) !== remoteUrls.sensitive
    );
    const currentWidth = props.w ?? 0;
    const currentHeight = props.h ?? 0;
    const sizeChanged = currentWidth < width || currentHeight < height;
    if (targetChanged || remoteChanged || sizeChanged) {
      editor.updateShape<ResourceShape>({
        id: existing.id,
        type: RESOURCE_SHAPE_TYPE,
        props: {
          line,
          column,
          endLine,
          endColumn,
          w: Math.max(currentWidth, width),
          h: Math.max(currentHeight, height),
          ...(resource.kind === 'remote-url' ? {
            url: remoteUrls.url,
            displayUrl: remoteUrls.displayUrl,
            sensitive: remoteUrls.sensitive,
          } : {}),
        },
      });
      if (options.focus !== false) requestResourceFocus(existing.id);
      editor.select(existing.id);
    } else if (options.focus !== false) {
      editor.select(existing.id);
      editor.zoomToSelection({ animation: { duration: 220 } });
    }
    return existing.id;
  }

  const displayName = resource.kind === 'remote-url'
    ? (() => {
        try { return new URL(remoteUrls.url).hostname; } catch { return 'External link'; }
      })()
    : resource.path?.split(/[\\/]/).pop() || resource.displayText || 'Resource';

  const id = createShapeId();
  editor.createShape<ResourceShape>({
    id,
    type: RESOURCE_SHAPE_TYPE,
    x: options.x ?? bounds.x + 48,
    y: options.y ?? bounds.y + 48,
    props: {
      resourceKind: resource.kind,
      displayName,
      path: resource.path ?? '',
      url: remoteUrls.url,
      displayUrl: remoteUrls.displayUrl,
      sensitive: remoteUrls.sensitive,
      cwd: resource.cwd,
      previewKind: resource.previewKind ?? 'binary',
      mimeType: resource.mimeType ?? '',
      terminalId: resource.terminalId ?? '',
      agentKind: resource.agentKind ?? '',
      line: resource.line ?? 0,
      column: resource.column ?? 0,
      endLine: resource.endLine ?? 0,
      endColumn: resource.endColumn ?? 0,
      w: width,
      h: height,
    },
  });
  if (options.focus !== false) {
    requestResourceFocus(id);
    editor.select(id);
  }
  return id;
}
