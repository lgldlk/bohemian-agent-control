import chalk from 'chalk';

/**
 * Bohemian Agent Control — CLI 启动横幅
 *
 * ANSI Shadow 花字 "BOHEMIAN" + Slant 花字 "AGENT CONTROL"
 * 由 figlet 生成后内联为静态字符串，运行时零依赖、零计算。
 * 颜色使用 chalk，不支持色彩的终端会自动降级为纯文本。
 */

const ASCII_SHADOW = [
  '██████╗  ██████╗ ██╗  ██╗███████╗███╗   ███╗██╗ █████╗ ███╗   ██╗',
  '██╔══██╗██╔═══██╗██║  ██║██╔════╝████╗ ████║██║██╔══██╗████╗  ██║',
  '██████╔╝██║   ██║███████║█████╗  ██╔████╔██║██║███████║██╔██╗ ██║',
  '██╔══██╗██║   ██║██╔══██║██╔══╝  ██║╚██╔╝██║██║██╔══██║██║╚██╗██║',
  '██████╔╝╚██████╔╝██║  ██║███████╗██║ ╚═╝ ██║██║██║  ██║██║ ╚████║',
  '╚═════╝  ╚═════╝ ╚═╝  ╚═╝╚══════╝╚═╝     ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝',
].join('\n');

const ASCII_SLANT = [
  '    ___   _____________   ________   __________  _   ____________  ____  __ ',
  '   /   | / ____/ ____/ | / /_  __/  / ____/ __ \\/ | / /_  __/ __ \\/ __ \\/ / ',
  '  / /| |/ / __/ __/ /  |/ / / /    / /   / / / /  |/ / / / / /_/ / / / / /  ',
  ' / ___ / /_/ / /___/ /|  / / /    / /___/ /_/ / /|  / / / / _, _/ /_/ / /___',
  '/_/  |_\\____/_____/_/ |_/ /_/     \\____/\\____/_/ |_/ /_/ /_/ |_|\\____/_____/',
].join('\n');

const TAGLINE = '  One canvas, every agent. — "Man is born free."';

export function printBanner(): void {
  const c = chalk.supportsColor ? chalk : null;
  const magenta = (s: string) => (c ? c.magenta.bold(s) : s);
  const cyan = (s: string) => (c ? c.cyan.bold(s) : s);
  const dim = (s: string) => (c ? c.dim(s) : s);

  console.log();
  console.log(magenta(ASCII_SHADOW));
  console.log(cyan(ASCII_SLANT));
  console.log();
  console.log(dim(TAGLINE));
  console.log();
}
