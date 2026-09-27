let boardSpaceSyncReady = false;

export function setBoardSpaceSyncReady(ready: boolean): void {
  boardSpaceSyncReady = ready;
}

export function isBoardSpaceSyncReady(): boolean {
  return boardSpaceSyncReady;
}
