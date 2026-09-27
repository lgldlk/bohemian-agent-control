/**
 * 像素风 Logo 标题 — "BOHEMIAN"
 *
 * 每个字母从街机调色板（红 → 橙 → 黄 → 琥珀）中循环取色，
 * 叠加 2px 硬边阴影制造立体像素感，末尾跟一个闪烁光标。
 */

const PALETTE = ['#f4f4f5', '#a1a1aa', '#f4f4f5', '#71717a'];
const TITLE = 'BOHEMIAN';

export function PixelLogo() {
  return (
    <h1 className="pixel-font text-[13px] leading-none">
      <span
        aria-label="Bohemian Agent Control"
        style={{
          textShadow:
            '2px 2px 0 #000, -1px -1px 0 rgba(0,0,0,0.6), 0 0 10px rgba(255,255,255,0.18)',
        }}
      >
        {TITLE.split('').map((ch, i) => (
          <span key={i} style={{ color: PALETTE[i % PALETTE.length] }}>
            {ch}
          </span>
        ))}
      </span>
      <span className="px-blink" style={{ color: '#f4f4f5' }}>
        _
      </span>
    </h1>
  );
}
