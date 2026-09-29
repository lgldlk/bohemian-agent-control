/**
 * Nested tmux cannot safely route terminal identity replies as out-of-band
 * responses. On every attach tmux probes the outer terminal with the complete
 * identity set: DA1 (`CSI c`), DA2 (`CSI > c`), and XTVERSION (`CSI > q`).
 * xterm.js emits their replies through `onData`; after the browser/WebSocket
 * round trip tmux may treat the late response body as keystrokes and inject it
 * into the active Agent editor.
 *
 * Handle the identity-query class before xterm's built-in handlers so none of
 * those replies is generated. This is protocol-level and version-independent.
 * Keyboard negotiation is intentionally untouched (`CSI > u`, `CSI ? u`,
 * modifyOtherKeys, and ordinary key input).
 */

interface Disposable {
  dispose(): void;
}

interface TerminalParser {
  registerCsiHandler(
    id: { prefix?: string; final: string },
    callback: (params: (number | number[])[]) => boolean | Promise<boolean>,
  ): Disposable;
}

export function installNestedTerminalQueryPolicy(parser: TerminalParser): Disposable {
  const handlers = [
    parser.registerCsiHandler({ final: 'c' }, () => true), // DA1
    parser.registerCsiHandler({ prefix: '>', final: 'c' }, () => true), // DA2
    parser.registerCsiHandler({ prefix: '>', final: 'q' }, () => true), // XTVERSION
  ];
  return {
    dispose(): void {
      for (const handler of handlers) handler.dispose();
    },
  };
}
