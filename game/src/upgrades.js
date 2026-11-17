// Level-up upgrades: each has a name, a short promise the player can read at a
// glance, a glyph drawn on its card, a level cap, and an apply() that folds it into
// the world's derived stats (recomputed by deriveStats after every pick).
export const UPGRADES = {
  damage: { name: 'Shard Power', glyph: '▲', max: 5, text: '+25% bullet damage' },
  rate: { name: 'Rapid Fire', glyph: '»', max: 5, text: '+18% fire rate' },
  multishot: { name: 'Split Shot', glyph: '✦', max: 3, text: '+1 projectile per volley' },
  pierce: { name: 'Piercing Shards', glyph: '→', max: 3, text: 'Bullets pierce +1 enemy' },
  speed: { name: 'Swift Boots', glyph: '≫', max: 4, text: '+12% move speed' },
  vitality: { name: 'Star Heart', glyph: '♥', max: 5, text: '+25 max HP, heal 25 now' },
  magnet: { name: 'Shard Magnet', glyph: '◎', max: 4, text: '+45% pickup radius' },
  dash: { name: 'Blink Step', glyph: '↯', max: 3, text: '-25% dash cooldown' },
  blades: { name: 'Orbit Blades', glyph: '✺', max: 3, text: '+1 orbiting blade' },
  crit: { name: 'Deadly Edge', glyph: '✕', max: 4, text: '+10% critical chance' },
};

const POOL = Object.keys(UPGRADES);

/** Derived combat stats from the upgrades taken so far (base values in config.js). */
export function deriveStats(upgrades) {
  const lvl = (id) => upgrades[id] || 0;
  return {
    damageMult: 1 + 0.25 * lvl('damage'),
    fireRateMult: 1 + 0.18 * lvl('rate'),
    projectiles: 1 + lvl('multishot'),
    pierce: lvl('pierce'),
    speedMult: 1 + 0.12 * lvl('speed'),
    maxHpBonus: 25 * lvl('vitality'),
    magnetMult: 1 + 0.45 * lvl('magnet'),
    dashCdMult: Math.pow(0.75, lvl('dash')),
    blades: lvl('blades'),
    critChance: 0.05 + 0.1 * lvl('crit'),
  };
}

/** Roll three distinct upgrades the player can still improve. */
export function rollChoices(upgrades, rng) {
  const open = POOL.filter((id) => (upgrades[id] || 0) < UPGRADES[id].max);
  const choices = [];
  while (choices.length < 3 && open.length > 0) {
    const pick = open.splice(Math.floor(rng.next() * open.length), 1)[0];
    choices.push(pick);
  }
  // Everything maxed: offer a heal and a score bonus instead of an empty screen.
  while (choices.length < 3) choices.push(choices.length === 0 ? 'heal' : 'riches');
  return choices;
}

/** Apply one choice to the world state; 'heal' and 'riches' are the fallback cards. */
export function applyChoice(state, id) {
  if (id === 'heal') {
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 40);
    return;
  }
  if (id === 'riches') {
    state.score += 150;
    return;
  }
  state.upgrades[id] = (state.upgrades[id] || 0) + 1;
  state.stats = deriveStats(state.upgrades);
  if (id === 'vitality') {
    state.player.maxHp = state.player.maxHp + 25;
    state.player.hp = Math.min(state.player.maxHp, state.player.hp + 25);
  }
  if (id === 'blades') syncBlades(state);
}

/** Keep the orbiting blades array in step with the blades upgrade. */
export function syncBlades(state) {
  const want = state.stats.blades;
  while (state.blades.length < want) {
    state.blades.push({ angle: (state.blades.length / Math.max(1, want)) * Math.PI * 2, hitCd: 0 });
  }
  state.blades.length = want;
}
