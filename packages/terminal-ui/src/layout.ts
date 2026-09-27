export type TerminalSplitDirection = 'horizontal' | 'vertical';

export type TerminalLayoutNode =
  | { type: 'leaf'; id: string; terminalId: string }
  | {
      type: 'split';
      id: string;
      direction: TerminalSplitDirection;
      ratio: number;
      first: TerminalLayoutNode;
      second: TerminalLayoutNode;
    };

export function terminalLeaf(terminalId: string): TerminalLayoutNode {
  return { type: 'leaf', id: makeLayoutId('leaf'), terminalId };
}

export function splitTerminalLeaf(
  root: TerminalLayoutNode,
  sourceTerminalId: string,
  newTerminalId: string,
  direction: TerminalSplitDirection,
): TerminalLayoutNode {
  if (root.type === 'leaf') {
    if (root.terminalId !== sourceTerminalId) return root;
    return {
      type: 'split',
      id: makeLayoutId('split'),
      direction,
      ratio: 0.5,
      first: root,
      second: terminalLeaf(newTerminalId),
    };
  }
  const first = splitTerminalLeaf(root.first, sourceTerminalId, newTerminalId, direction);
  if (first !== root.first) return { ...root, first };
  const second = splitTerminalLeaf(root.second, sourceTerminalId, newTerminalId, direction);
  return second === root.second ? root : { ...root, second };
}

export function removeTerminalLeaf(
  root: TerminalLayoutNode,
  terminalId: string,
): TerminalLayoutNode | null {
  if (root.type === 'leaf') return root.terminalId === terminalId ? null : root;
  const first = removeTerminalLeaf(root.first, terminalId);
  const second = removeTerminalLeaf(root.second, terminalId);
  if (!first) return second;
  if (!second) return first;
  if (first === root.first && second === root.second) return root;
  return { ...root, first, second };
}

export function updateSplitRatio(
  root: TerminalLayoutNode,
  splitId: string,
  ratio: number,
): TerminalLayoutNode {
  if (root.type === 'leaf') return root;
  if (root.id === splitId) return { ...root, ratio: Math.max(0.15, Math.min(0.85, ratio)) };
  const first = updateSplitRatio(root.first, splitId, ratio);
  const second = updateSplitRatio(root.second, splitId, ratio);
  return first === root.first && second === root.second ? root : { ...root, first, second };
}

export function collectTerminalIds(root: TerminalLayoutNode): string[] {
  return root.type === 'leaf'
    ? [root.terminalId]
    : [...collectTerminalIds(root.first), ...collectTerminalIds(root.second)];
}

export function replaceMissingTerminalIds(
  root: TerminalLayoutNode,
  available: ReadonlySet<string>,
): TerminalLayoutNode | null {
  if (root.type === 'leaf') return available.has(root.terminalId) ? root : null;
  const first = replaceMissingTerminalIds(root.first, available);
  const second = replaceMissingTerminalIds(root.second, available);
  if (!first) return second;
  if (!second) return first;
  return { ...root, first, second };
}

function makeLayoutId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
