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
/*
 * xterm 6 的滚动条是 .xterm-scrollbar，不是 viewport 的原生滚动条。
 * 下面的行 span 会向下溢出 1px；滚动条必须压在行内容上面，否则会被盖住。
 * 不要删这个 z-index，也不要改去隐藏 .xterm-scrollbar。
 */
.bac-term .xterm-scrollable-element > .xterm-scrollbar {
  z-index: 12;
}
.bac-term .xterm-scrollable-element > .xterm-scrollbar.xterm-invisible.xterm-fade {
  opacity: 1;
  pointer-events: auto;
}
/* 只藏 viewport 的原生滚动条。xterm 自己的滑块在 .xterm-scrollbar。 */
.bac-term .xterm-viewport {
  /*
   * xterm 6 drives its custom scrollbar through the viewport's scrollTop.
   * Keep vertical overflow scrollable; hiding overflow entirely makes
   * scrollLines/page wheel updates no-op in Chromium even though history
   * remains in the buffer.
   */
  overflow-y: scroll !important;
  overflow-x: hidden !important;
  background-color: transparent !important;
  scrollbar-width: none;
}
.bac-term .xterm-viewport::-webkit-scrollbar {
  width: 0;
  height: 0;
}
.bac-term .xterm-screen {
  overflow: hidden;
  background-color: var(--bac-term-bg, transparent);
}
/*
 * 画板缩放后，xterm DOM 行之间会出现 1px 黑缝。已在 Retina DPR 2 的真实终端上验证。
 * 正确做法是让每个 ANSI span 用自己的背景向下多绘 1px。
 * 不要改回这些方案，它们都会让黑线回来或盖住滚动条：
 * - 用统一的终端底色、行背景或 box-shadow 补缝（ANSI 色块之间仍会露黑线）
 * - 把 .xterm-rows 设成 position:absolute / inset:0
 * - 把行或 span 的背景改成 transparent
 * - 去掉 overflow:visible 或把 span 高度改回 100%
 */
.bac-term .xterm-rows {
  background-color: var(--bac-term-bg, transparent);
}
.bac-term .xterm-rows > div {
  overflow: visible !important;
}
.bac-term .xterm-rows > div > span {
  height: calc(100% + 1px) !important;
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
