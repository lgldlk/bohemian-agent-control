/** 会话快照版本。fingerprint 变才 bump rev，给前端做增量轮询。 */
export class SnapshotClock {
  rev = 0;
  fingerprint = '';

  touch(fingerprint: string): number {
    if (fingerprint !== this.fingerprint) {
      this.fingerprint = fingerprint;
      this.rev += 1;
    }
    return this.rev;
  }
}
