const TERMINAL_CSS = `
.bac-term,
.bac-term .xterm,
.bac-term .xterm-viewport,
.bac-term .xterm-screen,
.bac-term textarea {
  pointer-events: all;
}
.bac-term .xterm {
  height: 100%;
  width: 100%;
  padding: 0;
}
.bac-term .xterm .xterm-scrollable-element > .xterm-scrollbar > .xterm-slider {
  border-radius: 4px;
}
/* xterm 6 fades its own scrollbar on mouseout. Keep a needed thumb visible in every pane. */
.bac-term .xterm-scrollable-element > .xterm-scrollbar.xterm-invisible.xterm-fade {
  opacity: 1;
  pointer-events: auto;
}
.bac-term .xterm-viewport {
  overflow: hidden !important;
  background-color: transparent !important;
  scrollbar-width: none;
}
.bac-term .xterm-viewport::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.bac-term .xterm-screen {
  overflow: hidden;
}
.bac-term canvas {
  image-rendering: auto;
}
`;

let injected = false;

export function ensureTerminalStyles(): void {
  if (typeof document === 'undefined') return;
  injected = true;
  let style = document.getElementById('bac-term-css');
  if (!style) {
    style = document.createElement('style');
    style.id = 'bac-term-css';
    document.head.appendChild(style);
  }
  style.textContent = TERMINAL_CSS;
}
