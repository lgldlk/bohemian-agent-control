import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Editor } from 'tldraw';
import { createEmptyBusinessGroupAtPoint } from './groupFrameEditor';
import { useSpaceStore } from '@/space/spaceStore';

const initialGroups = useSpaceStore.getState().groups;

describe('business group creation', () => {
  afterEach(() => {
    useSpaceStore.setState({ groups: initialGroups });
  });

  it('creates a space group and a frame carrying its groupId', () => {
    useSpaceStore.setState({
      groups: [{ id: 'default', name: '未分组', taskIds: [], collapsed: false }],
    });
    const created: Array<Record<string, unknown>> = [];
    const select = vi.fn();
    const setEditingShape = vi.fn();
    const editor = {
      getCurrentPageShapes: () => [],
      createShapes: (shapes: Array<Record<string, unknown>>) => created.push(...shapes),
      select,
      setEditingShape,
    } as unknown as Editor;

    const frameId = createEmptyBusinessGroupAtPoint(editor, { x: 120, y: 80 });
    const groups = useSpaceStore.getState().groups;
    const businessGroup = groups.find((group) => group.id !== 'default');

    expect(frameId).toBeTruthy();
    expect(businessGroup).toBeTruthy();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      id: frameId,
      type: 'frame',
      x: 120,
      y: 80,
      props: { name: businessGroup!.name },
      meta: { groupId: businessGroup!.id },
    });
    expect(select).toHaveBeenCalledWith(frameId);
    expect(setEditingShape).toHaveBeenCalledWith(frameId);
  });
});
