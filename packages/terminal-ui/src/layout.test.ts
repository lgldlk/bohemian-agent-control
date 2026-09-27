import { describe, expect, it } from 'vitest';
import {
  collectTerminalIds,
  removeTerminalLeaf,
  replaceMissingTerminalIds,
  splitTerminalLeaf,
  terminalLeaf,
  updateSplitRatio,
} from './layout';

describe('terminal split layout', () => {
  it('splits a leaf recursively in both directions', () => {
    const root = terminalLeaf('a');
    const horizontal = splitTerminalLeaf(root, 'a', 'b', 'horizontal');
    const vertical = splitTerminalLeaf(horizontal, 'b', 'c', 'vertical');
    expect(collectTerminalIds(vertical)).toEqual(['a', 'b', 'c']);
    expect(vertical.type).toBe('split');
    if (vertical.type !== 'split') return;
    expect(vertical.direction).toBe('horizontal');
    expect(vertical.second.type).toBe('split');
  });

  it('collapses a split when a leaf is removed', () => {
    const split = splitTerminalLeaf(terminalLeaf('a'), 'a', 'b', 'vertical');
    expect(removeTerminalLeaf(split, 'b')).toMatchObject({ type: 'leaf', terminalId: 'a' });
    expect(removeTerminalLeaf(split, 'a')).toMatchObject({ type: 'leaf', terminalId: 'b' });
    expect(removeTerminalLeaf(terminalLeaf('a'), 'a')).toBeNull();
  });

  it('clamps divider ratio and drops missing terminals', () => {
    const split = splitTerminalLeaf(terminalLeaf('a'), 'a', 'b', 'horizontal');
    const resized = updateSplitRatio(split, split.type === 'split' ? split.id : '', 1.4);
    expect(resized.type === 'split' && resized.ratio).toBe(0.85);
    expect(replaceMissingTerminalIds(split, new Set(['b']))).toMatchObject({ type: 'leaf', terminalId: 'b' });
    expect(replaceMissingTerminalIds(split, new Set())).toBeNull();
  });
});
