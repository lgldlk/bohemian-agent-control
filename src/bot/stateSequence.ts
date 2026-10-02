import type { StateId } from './states';

/** Deterministic preview time for each animation state. */
export const POSES: Record<StateId, number> = {
  idle: 1,
  thinking: 1.1,
  wink: 0.8,
  wide: 0.8,
  alert: 0.75,
  notify: 0.9,
  exclaim: 0.8,
  sleep: 0.45,
  egg: 0.8,
  hexagon: 0.8,
  play: 0.9,
  orbit: 1.2,
  swirl: 0.5,
  burst: 0.45,
  comet: 1.15,
};

/** Complete animation order, excluding the settings-only swirl transition. */
export const SEQUENCE: StateId[] = [
  'idle', 'thinking', 'wink', 'wide', 'alert', 'notify', 'exclaim',
  'sleep', 'egg', 'hexagon', 'play', 'orbit', 'burst', 'comet',
];
