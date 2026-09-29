import type { BoardAgentStatus } from '@/lib/boardStatus';
import type { BoardTerminalRuntimePhase } from '@/plugin-system';

export type TerminalStatusKey = BoardAgentStatus | BoardTerminalRuntimePhase;

/** Every state gets its own small pool so repeated renders do not feel identical. */
export const TERMINAL_STATUS_KAOMOJI_COLLECTION: Record<TerminalStatusKey, readonly string[]> = {
  loading: ['( ˘ω˘ )', '(。-ω-)zzz', '(っ˘ω˘ς )', '(¦3[▓▓]'],
  connecting: ['(・ω・)ノ', '(つ≧▽≦)つ', "(ง'̀-'́)ง", '(｡•́‿•̀｡)'],
  hydrating: ['(ง •̀_•́)ง', '(๑•̀ㅂ•́)و✧', '( •̀ᴗ•́ )و', '(⌐■_■)'],
  ready: ['(￣▽￣)ノ', '(｡•̀ᴗ-)✧', '(๑˃̵ᴗ˂̵)و', '(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧'],
  reconnecting: ['(；ω；)', '(ノД`)・゜・。', '(つ﹏⊂)', '(；￣Д￣)'],
  missing: ['(・_・;)', '(°ロ°)☝', '(⊙_⊙;)', '(・・ ) ?'],
  exited: ['(－_－) zzZ', '(￣□￣;)', '(×_×)', '(＿ ＿*)'],
  error: ['(╥﹏╥)', '(ಥ﹏ಥ)', '(ノಠ益ಠ)ノ彡', '(x_x)'],
  working: ['(•̀ᴗ•́)و', '(ง •̀_•́)ง', '(๑•̀ㅂ•́)و✧', '(╯°□°）╯︵'],
  blocked: ['(・へ・)', '(￢_￢)', '(눈_눈)', '(ಠ_ಠ)'],
  idle: ['(￣ω￣)', '(－ω－) zzZ', '(´-ω-`)', '(＿ ＿*)'],
  starting: ['(ﾉ◕ヮ◕)ﾉ*:･ﾟ✧', '(๑•̀ㅂ•́)و✧', '(つ≧▽≦)つ', '(ง •̀_•́)ง'],
  running: ['(•̀ᴗ•́)و ̑̑', '(⌐■_■)', '( •̀ᴗ•́ )و', '(๑•̀ㅂ•́)و'],
  pending: ['(っ˘ω˘ς )', '(´・ω・`)', '(｡•́︿•̀｡)', '(・ω・)'],
  completed: ['(＾▽＾)', '(｡•̀ᴗ-)✧', '(๑˃̵ᴗ˂̵)و', '(￣▽￣)ノ'],
  deleted: ['(x_x)', '(×_×)', '(†_†)', '(；一_一)'],
  unknown: ['(・・?)', '(・_・ヾ', '(￣▽￣;)', '(・・;)'],
};

/** Backward-compatible representative face for callers that only need one. */
export const TERMINAL_STATUS_KAOMOJI: Record<TerminalStatusKey, string> = Object.fromEntries(
  Object.entries(TERMINAL_STATUS_KAOMOJI_COLLECTION).map(([key, faces]) => [key, faces[0]]),
) as Record<TerminalStatusKey, string>;

export function pickTerminalKaomoji(
  status: TerminalStatusKey,
  random: () => number = Math.random,
): string {
  const faces = TERMINAL_STATUS_KAOMOJI_COLLECTION[status];
  if (!faces?.length) return TERMINAL_STATUS_KAOMOJI.unknown;
  const index = Math.min(faces.length - 1, Math.max(0, Math.floor(random() * faces.length)));
  return faces[index] ?? faces[0] ?? TERMINAL_STATUS_KAOMOJI.unknown;
}
