// Tuning for Starshard Arena: every number that shapes how the game feels lives here,
// so balancing is one file. Times are seconds, speeds are pixels per second.
export const STEP = 1 / 60;
export const BEST_KEY = 'starshard-arena-best';
export const TAU = Math.PI * 2;

export const PLAYER = {
  radius: 14,
  speed: 250,
  maxHp: 100,
  fireInterval: 0.38,
  fireRange: 560,
  bulletSpeed: 540,
  bulletDamage: 12,
  bulletRadius: 5,
  magnet: 90,
  dashCooldown: 1.6,
  dashTime: 0.18,
  dashSpeed: 2.7,
  hitInvuln: 0.6,
};

export const COMBO_WINDOW = 2.5;
export const COMBO_MAX = 8;
export const GEM_MAGNET_PULL = 620;

/** XP needed to go from `level` to `level + 1`. */
export function xpForLevel(level) {
  return 6 + (level - 1) * 5;
}

/** Enemy kinds. cost: wave-budget points. unlock: first wave it can appear in. */
export const ENEMIES = {
  wisp: { radius: 13, hp: 22, speed: 88, damage: 10, score: 10, xp: 1, cost: 1, unlock: 1, color: '#b06cff' },
  dart: { radius: 9, hp: 12, speed: 168, damage: 8, score: 10, xp: 1, cost: 1, unlock: 2, color: '#ff5e8a' },
  splitter: { radius: 16, hp: 34, speed: 70, damage: 12, score: 20, xp: 2, cost: 2, unlock: 3, color: '#5eff8a' },
  spitter: { radius: 14, hp: 28, speed: 62, damage: 8, score: 20, xp: 2, cost: 2, unlock: 4, color: '#3fd9c0' },
  bulwark: { radius: 24, hp: 110, speed: 42, damage: 18, score: 30, xp: 3, cost: 3, unlock: 5, color: '#ff9a3d' },
};

/** How many budget points wave `n` spends, and how fast it spends them. */
export function waveBudget(n) {
  return 6 + n * 4;
}
export function spawnInterval(n) {
  return Math.max(0.35, 1.05 - n * 0.06);
}
/** Enemy stat growth per wave past the first. */
export function waveHpScale(n) {
  return 1 + 0.16 * (n - 1);
}
export function waveDamageScale(n) {
  return 1 + 0.07 * (n - 1);
}
