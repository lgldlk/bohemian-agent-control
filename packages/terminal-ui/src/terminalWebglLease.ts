const MAX_TERMINAL_WEBGL_LEASES = 2;
let activeLeases = 0;

export function acquireTerminalWebglLease(): (() => void) | null {
  if (activeLeases >= MAX_TERMINAL_WEBGL_LEASES) return null;
  activeLeases += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    activeLeases = Math.max(0, activeLeases - 1);
  };
}

export function activeTerminalWebglLeases(): number {
  return activeLeases;
}

export const MAX_ACTIVE_TERMINAL_WEBGL_LEASES = MAX_TERMINAL_WEBGL_LEASES;
