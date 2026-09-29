import { WebglAddon } from '@xterm/addon-webgl';
import type { Terminal as XTerm } from '@xterm/xterm';
import { acquireTerminalWebglLease } from './terminalWebglLease';

export interface TerminalWebglController {
  attach(): void;
  release(): void;
  isAttached(): boolean;
}

export function createTerminalWebglController(options: {
  xterm: XTerm;
  enabled: boolean;
  customGlyphs: boolean;
  isCold: () => boolean;
  isActive: () => boolean;
}): TerminalWebglController {
  let webglAddon: WebglAddon | null = null;
  let releaseLease: (() => void) | null = null;
  let retried = false;

  const release = () => {
    webglAddon?.dispose();
    webglAddon = null;
    releaseLease?.();
    releaseLease = null;
  };

  const attach = () => {
    if (!options.enabled || webglAddon || options.isCold()) return;
    const lease = acquireTerminalWebglLease();
    if (!lease) return;
    try {
      const addon = new WebglAddon({ customGlyphs: options.customGlyphs });
      webglAddon = addon;
      releaseLease = lease;
      addon.onContextLoss(() => {
        addon.dispose();
        webglAddon = null;
        releaseLease?.();
        releaseLease = null;
        if (!retried && options.isActive() && !options.isCold()) {
          retried = true;
          attach();
        }
      });
      options.xterm.loadAddon(addon);
    } catch {
      lease();
    }
  };

  return { attach, release, isAttached: () => webglAddon !== null };
}
