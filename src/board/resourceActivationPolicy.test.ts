import { describe, expect, it, vi } from 'vitest';
import type { Editor } from 'tldraw';
import { getResourceActivationPolicy } from './resourceActivationPolicy';

function editorStub(shapes: Array<{ id: string; x: number; y: number; w: number; h: number }>, zoom = 1) {
  return {
    getCurrentPageShapes: () => shapes.map((shape) => ({
      id: shape.id,
      type: 'resource',
      x: shape.x,
      y: shape.y,
      props: { w: shape.w, h: shape.h },
    })),
    getViewportPageBounds: () => ({ x: 0, y: 0, w: 1000, h: 800 }),
    getShapePageBounds: (shape: { x: number; y: number; props: { w: number; h: number } }) => ({
      x: shape.x,
      y: shape.y,
      w: shape.props.w,
      h: shape.props.h,
    }),
    getZoomLevel: () => zoom,
  } as unknown as Editor;
}

describe('resource activation policy', () => {
  it('keeps every readable in-viewport resource and fills the remaining slots by distance', () => {
    const shapes = [
      { id: 'near-a', x: 20, y: 20, w: 300, h: 220 },
      { id: 'near-b', x: 650, y: 20, w: 300, h: 220 },
      { id: 'far-a', x: 1200, y: 0, w: 300, h: 220 },
      { id: 'far-b', x: 1600, y: 0, w: 300, h: 220 },
      { id: 'far-c', x: 2000, y: 0, w: 300, h: 220 },
      { id: 'far-d', x: 2400, y: 0, w: 300, h: 220 },
    ];
    const policy = getResourceActivationPolicy(editorStub(shapes), { enabled: true, resourceThreshold: 5 });
    expect(policy.resourceCount).toBe(6);
    expect([...policy.readableIds]).toEqual(['near-a', 'near-b']);
    expect(policy.deferredIds.has('far-a')).toBe(false);
    expect(policy.deferredIds.has('far-b')).toBe(false);
    expect(policy.deferredIds.has('far-c')).toBe(false);
    expect(policy.deferredIds.has('far-d')).toBe(true);
  });

  it('keeps all readable resources even when their count exceeds the threshold', () => {
    const shapes = Array.from({ length: 6 }, (_, index) => ({
      id: `visible-${index}`,
      x: (index % 3) * 320,
      y: Math.floor(index / 3) * 260,
      w: 280,
      h: 220,
    }));
    const policy = getResourceActivationPolicy(editorStub(shapes), { enabled: true, resourceThreshold: 3 });
    expect(policy.readableIds.size).toBe(6);
    expect(policy.deferredIds.size).toBe(0);
  });

  it('treats tiny zoomed-out nodes as candidates for smart deferral', () => {
    const shapes = Array.from({ length: 6 }, (_, index) => ({
      id: `resource-${index}`,
      x: index * 350,
      y: 0,
      w: 900,
      h: 620,
    }));
    const policy = getResourceActivationPolicy(editorStub(shapes, 0.05), { enabled: true, resourceThreshold: 3 });
    expect(policy.readableIds.size).toBe(0);
    expect(policy.deferredIds.size).toBe(3);
  });

  it('does not defer anything below threshold or when disabled', () => {
    const editor = editorStub([{ id: 'one', x: 0, y: 0, w: 100, h: 100 }]);
    expect(getResourceActivationPolicy(editor, { enabled: true, resourceThreshold: 2 }).deferredIds.size).toBe(0);
    expect(getResourceActivationPolicy(editor, { enabled: false, resourceThreshold: 2 }).deferredIds.size).toBe(0);
  });
});
