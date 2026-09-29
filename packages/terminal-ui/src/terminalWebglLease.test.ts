import { describe, expect, it } from 'vitest';
import {
  acquireTerminalWebglLease,
  activeTerminalWebglLeases,
  MAX_ACTIVE_TERMINAL_WEBGL_LEASES,
} from './terminalWebglLease';

describe('terminal WebGL lease', () => {
  it('caps concurrent terminal WebGL contexts', () => {
    const releases = Array.from({ length: MAX_ACTIVE_TERMINAL_WEBGL_LEASES }, () => acquireTerminalWebglLease());
    expect(releases.every(Boolean)).toBe(true);
    const extra = acquireTerminalWebglLease();
    expect(extra).toBeNull();
    releases[0]?.();
    const replacement = acquireTerminalWebglLease();
    expect(replacement).not.toBeNull();
    releases.slice(1).forEach((release) => release?.());
    replacement?.();
  });

  it('releases a lease at most once', () => {
    const release = acquireTerminalWebglLease();
    release?.();
    release?.();
    expect(activeTerminalWebglLeases()).toBe(0);
  });
});
