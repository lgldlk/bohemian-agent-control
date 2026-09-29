export interface BoardDoubleClickHit {
  type: string;
}

export interface BlankBoardDoubleClickTarget {
  groupId?: string;
}

/** Only a point with no shape hit is board whitespace. */
export function resolveBlankBoardDoubleClick(
  hit: BoardDoubleClickHit | undefined,
  groupIdAtPoint: string | null,
): BlankBoardDoubleClickTarget | null {
  if (hit) return null;
  return groupIdAtPoint ? { groupId: groupIdAtPoint } : {};
}
