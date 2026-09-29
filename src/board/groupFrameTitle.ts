/**
 * tldraw 把组标题放在已缩放的 HTML 层里，再用 scale(min(1/zoom, 3.5)) 抵消。
 * 3.5 的上限会让缩小后的标题变小。去掉上限后，屏幕上的字号不随画布缩放变化。
 */
const CAPPED_FRAME_TITLE_SCALE = /scale\(min\(var\(--tl-scale\),\s*3\.5\)\)/g;

export function screenSizedFrameTitleTransform(transform: string): string {
  return transform.replace(CAPPED_FRAME_TITLE_SCALE, 'scale(var(--tl-scale))');
}

export function bindScreenSizedGroupTitles(root: ParentNode): () => void {
  const fix = (node: Element) => {
    if (!(node instanceof HTMLElement) || !node.classList.contains('tl-frame-heading')) return;
    const next = screenSizedFrameTitleTransform(node.style.transform);
    if (next !== node.style.transform) node.style.transform = next;
  };
  const scan = (node: Element) => {
    fix(node);
    node.querySelectorAll('.tl-frame-heading').forEach(fix);
  };

  root.querySelectorAll('.tl-frame-heading').forEach(fix);
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.target instanceof Element) fix(record.target);
      for (const node of record.addedNodes) {
        if (node instanceof Element) scan(node);
      }
    }
  });
  observer.observe(root, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['style'],
  });
  return () => observer.disconnect();
}
