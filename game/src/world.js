// The simulation: one fixed step of the arena. It owns the player, enemies, bullets,
// gems, particles, waves and scoring, and reports what happened as event bits so the
// shell (main.js) can play sounds and announce. It knows nothing about the DOM, the
// canvas or audio: the same step drives the live game and the screenshot autopilot.
import {
  COMBO_MAX, COMBO_WINDOW, ENEMIES, GEM_MAGNET_PULL, PLAYER,
  spawnInterval, waveBudget, waveDamageScale, waveHpScale, xpForLevel,
} from './config.js';
import { deriveStats, rollChoices, applyChoice, syncBlades } from './upgrades.js';

export const EVENT_HIT = 1;
export const EVENT_OVER = 2;
export const EVENT_LEVELUP = 4;
export const EVENT_WAVE = 8;
export const EVENT_PICKUP = 16;
export const EVENT_DASH = 32;

const WAVE_TYPES = ['wisp', 'dart', 'splitter', 'spitter', 'bulwark'];

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(rng) {
  const state = {
    w: 960, h: 600, time: 0, score: 0, kills: 0, wave: 1,
    combo: 0, comboTimer: 0,
    player: null, bullets: [], enemies: [], orbs: [], gems: [],
    parts: [], floats: [], blades: [],
    spawnQueue: 0, spawnTimer: 0, waveState: 'fighting', clearTimer: 0,
    banner: null, bannerTimer: 0, shake: 0, flash: 0,
    over: false, pendingChoices: null, upgrades: {}, stats: deriveStats({}),
    attract: false, muted: false,
  };

  function freshPlayer() {
    return {
      x: state.w / 2, y: state.h / 2, r: PLAYER.radius,
      hp: PLAYER.maxHp, maxHp: PLAYER.maxHp, level: 1, xp: 0, xpNext: xpForLevel(1),
      fireTimer: 0.3, dashCd: 0, dashTimer: 0, dashDx: 1, dashDy: 0, invuln: 0, face: -Math.PI / 2, moving: false,
    };
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = rng.next() * Math.PI * 2;
      const v = speed * (0.3 + rng.next() * 0.7);
      state.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5 + rng.next() * 0.4, maxLife: 0.9, size: 2 + rng.next() * 3, color });
    }
  }

  function floater(x, y, text, color) {
    state.floats.push({ x, y, text, color, life: 0.8 });
  }

  function setBanner(text, sub, dur = 2) {
    state.banner = { text, sub };
    state.bannerTimer = dur;
  }

  function startWave(n) {
    state.wave = n;
    state.waveState = 'fighting';
    state.spawnQueue = waveBudget(n);
    state.spawnTimer = 0.5;
    setBanner(`WAVE ${n}`, n % 5 === 0 ? 'An elite stirs in the void…' : 'Hold the arena!');
  }

  function spawnEnemy(kind, elite) {
    const def = ENEMIES[kind];
    const margin = 30;
    const side = rng.int(0, 3);
    let x;
    let y;
    if (side === 0) { x = rng.range(0, state.w); y = -margin; }
    else if (side === 1) { x = state.w + margin; y = rng.range(0, state.h); }
    else if (side === 2) { x = rng.range(0, state.w); y = state.h + margin; }
    else { x = -margin; y = rng.range(0, state.h); }
    const scale = elite ? 1.6 : 1;
    state.enemies.push({
      kind, x, y, r: def.radius * scale,
      hp: def.hp * waveHpScale(state.wave) * (elite ? 8 : 1),
      maxHp: def.hp * waveHpScale(state.wave) * (elite ? 8 : 1),
      speed: def.speed * (elite ? 0.9 : 1) * rng.range(0.9, 1.1),
      damage: def.damage * waveDamageScale(state.wave) * (elite ? 2 : 1),
      score: def.score * (elite ? 5 : 1), xp: def.xp * (elite ? 8 : 1),
      color: def.color, elite: !!elite, spawnT: 0.45, fireTimer: rng.range(1, 2.4),
      wobble: rng.next() * Math.PI * 2, flash: 0, bladeCd: 0, telegraph: 0,
    });
  }

  function pickKind() {
    const open = WAVE_TYPES.filter((k) => ENEMIES[k].unlock <= state.wave);
    return rng.pick(open);
  }

  function dropGems(x, y, xp, elite) {
    let left = xp;
    while (left > 0) {
      const val = left >= 3 ? 3 : left;
      left -= val;
      state.gems.push({ x: x + rng.range(-14, 14), y: y + rng.range(-14, 14), val, heart: false, vx: rng.range(-40, 40), vy: rng.range(-40, 40) });
    }
    if (elite || rng.chance(0.03)) {
      state.gems.push({ x, y, val: 0, heart: true, vx: 0, vy: 0 });
    }
  }

  function killEnemy(index) {
    const e = state.enemies[index];
    state.enemies.splice(index, 1);
    state.kills += 1;
    state.combo = Math.min(COMBO_MAX, state.combo + 1);
    state.comboTimer = COMBO_WINDOW;
    const gained = Math.round(e.score * (1 + 0.1 * state.combo));
    state.score += gained;
    floater(e.x, e.y - e.r, `+${gained}`, '#ffe9a8');
    burst(e.x, e.y, e.color, e.elite ? 26 : 12, e.elite ? 260 : 170);
    if (e.elite) {
      state.shake = Math.max(state.shake, 12);
      dropGems(e.x, e.y, e.xp, true);
    } else {
      dropGems(e.x, e.y, e.xp, false);
    }
    if (e.kind === 'splitter') {
      for (let i = 0; i < 2; i += 1) {
        const def = ENEMIES.wisp;
        state.enemies.push({
          kind: 'wisp', x: e.x + (i === 0 ? -14 : 14), y: e.y, r: 9,
          hp: def.hp * waveHpScale(state.wave), maxHp: def.hp * waveHpScale(state.wave),
          speed: def.speed * 1.15, damage: def.damage, score: 5, xp: 1,
          color: def.color, elite: false, spawnT: 0.2, fireTimer: 0,
          wobble: rng.next() * Math.PI * 2, flash: 0, bladeCd: 0, telegraph: 0,
        });
      }
    }
  }

  function hurtPlayer(dmg) {
    const p = state.player;
    if (p.invuln > 0 || p.dashTimer > 0 || state.attract) return 0;
    p.hp -= dmg;
    p.invuln = PLAYER.hitInvuln;
    state.shake = Math.max(state.shake, 9);
    state.flash = 0.35;
    burst(p.x, p.y, '#ff5e5e', 10, 200);
    if (p.hp <= 0) {
      p.hp = 0;
      state.over = true;
      burst(p.x, p.y, '#ffd76a', 40, 320);
      burst(p.x, p.y, '#ffffff', 20, 200);
      return EVENT_OVER;
    }
    return EVENT_HIT;
  }

  function gainXp(amount) {
    const p = state.player;
    p.xp += amount;
    if (p.xp < p.xpNext) return 0;
    p.xp -= p.xpNext;
    p.level += 1;
    p.xpNext = xpForLevel(p.level);
    state.pendingChoices = rollChoices(state.upgrades, rng);
    burst(p.x, p.y, '#ffe9a8', 24, 220);
    return EVENT_LEVELUP;
  }

  function nearestEnemy(x, y, maxDist) {
    let best = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      if (e.spawnT > 0) continue;
      const d = dist2(x, y, e.x, e.y);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  function fireAt(target) {
    const p = state.player;
    const s = state.stats;
    const base = Math.atan2(target.y - p.y, target.x - p.x);
    const n = s.projectiles;
    for (let i = 0; i < n; i += 1) {
      const spread = (i - (n - 1) / 2) * 0.14;
      const a = base + spread;
      state.bullets.push({
        x: p.x + Math.cos(a) * (p.r + 6), y: p.y + Math.sin(a) * (p.r + 6),
        vx: Math.cos(a) * PLAYER.bulletSpeed, vy: Math.sin(a) * PLAYER.bulletSpeed,
        r: PLAYER.bulletRadius, dmg: PLAYER.bulletDamage * s.damageMult, pierce: s.pierce,
      });
    }
    p.fireTimer = PLAYER.fireInterval / s.fireRateMult;
    return true;
  }

  function stepPlayer(dt, move, dash) {
    const p = state.player;
    const s = state.stats;
    if (dash && p.dashCd <= 0) {
      // Dash in the movement direction, or the facing direction when standing still.
      p.dashTimer = PLAYER.dashTime;
      p.dashCd = PLAYER.dashCooldown * s.dashCdMult;
      if (move.x !== 0 || move.y !== 0) {
        p.dashDx = move.x;
        p.dashDy = move.y;
      } else {
        p.dashDx = Math.cos(p.face);
        p.dashDy = Math.sin(p.face);
      }
      burst(p.x, p.y, '#7fe7ff', 8, 120);
    }
    const speed = PLAYER.speed * s.speedMult * (p.dashTimer > 0 ? PLAYER.dashSpeed : 1);
    if (p.dashTimer > 0) {
      p.x += p.dashDx * speed * dt;
      p.y += p.dashDy * speed * dt;
    } else {
      p.x += move.x * speed * dt;
      p.y += move.y * speed * dt;
    }
    p.x = Math.max(p.r, Math.min(state.w - p.r, p.x));
    p.y = Math.max(p.r, Math.min(state.h - p.r, p.y));
    p.moving = move.x !== 0 || move.y !== 0;
    if (p.moving) p.face = Math.atan2(move.y, move.x);
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.dashTimer > 0) {
      p.dashTimer -= dt;
      state.parts.push({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 10, color: '#7fe7ff' });
    }
    if (p.invuln > 0) p.invuln -= dt;
    // Auto-fire at the nearest enemy in range.
    p.fireTimer -= dt;
    if (p.fireTimer <= 0) {
      const target = nearestEnemy(p.x, p.y, PLAYER.fireRange);
      if (target) fireAt(target);
      else p.fireTimer = 0.08;
    }
    // Orbiting blades.
    for (let i = 0; i < state.blades.length; i += 1) {
      const b = state.blades[i];
      b.angle += dt * 3.4;
      b.hitCd -= dt;
    }
  }

  function stepEnemies(dt) {
    const p = state.player;
    for (let i = 0; i < state.enemies.length; i += 1) {
      const e = state.enemies[i];
      if (e.spawnT > 0) e.spawnT -= dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.bladeCd > 0) e.bladeCd -= dt;
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      let vx = 0;
      let vy = 0;
      if (e.kind === 'dart') {
        e.wobble += dt * 6;
        const px = -dy / d;
        const py = dx / d;
        vx = (dx / d) * e.speed + px * Math.sin(e.wobble) * 60;
        vy = (dy / d) * e.speed + py * Math.sin(e.wobble) * 60;
      } else if (e.kind === 'spitter') {
        if (d > 300) { vx = (dx / d) * e.speed; vy = (dy / d) * e.speed; }
        else if (d < 200) { vx = (-dx / d) * e.speed; vy = (-dy / d) * e.speed; }
        else { vx = (-dy / d) * e.speed * 0.5; vy = (dx / d) * e.speed * 0.5; }
        e.fireTimer -= dt;
        if (e.fireTimer <= 0 && e.spawnT <= 0 && d < 520) {
          e.telegraph = 0.25;
          e.fireTimer = 2.4;
          state.orbs.push({
            x: e.x, y: e.y, vx: (dx / d) * 170, vy: (dy / d) * 170,
            r: 7, dmg: e.damage, life: 5,
          });
        }
        if (e.telegraph > 0) e.telegraph -= dt;
      } else {
        vx = (dx / d) * e.speed;
        vy = (dy / d) * e.speed;
      }
      e.x += vx * dt;
      e.y += vy * dt;
    }
    // Gentle separation so enemies do not stack into one blob.
    for (let i = 0; i < state.enemies.length; i += 1) {
      for (let j = i + 1; j < state.enemies.length; j += 1) {
        const a = state.enemies[i];
        const b = state.enemies[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const min = a.r + b.r;
        const d2 = dx * dx + dy * dy;
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.25;
          const nx = dx / d;
          const ny = dy / d;
          a.x -= nx * push;
          a.y -= ny * push;
          b.x += nx * push;
          b.y += ny * push;
        }
      }
    }
  }

  function stepBullets(dt) {
    const s = state.stats;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.x < -20 || b.x > state.w + 20 || b.y < -20 || b.y > state.h + 20;
      if (!dead) {
        for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
          const e = state.enemies[j];
          if (e.spawnT > 0) continue;
          const rr = b.r + e.r;
          if (dist2(b.x, b.y, e.x, e.y) < rr * rr) {
            const crit = rng.next() < s.critChance;
            const dmg = Math.round(b.dmg * (crit ? 2 : 1));
            e.hp -= dmg;
            e.flash = 0.12;
            floater(e.x, e.y - e.r - 4, String(dmg), crit ? '#ffcf3d' : '#ffffff');
            burst(b.x, b.y, '#ffe9a8', 3, 90);
            if (e.hp <= 0) killEnemy(j);
            if (b.pierce > 0) {
              b.pierce -= 1;
            } else {
              dead = true;
            }
            break;
          }
        }
      }
      if (dead) state.bullets.splice(i, 1);
    }
  }

  function stepBlades(dt) {
    const p = state.player;
    const dmg = 16 * state.stats.damageMult;
    for (let i = 0; i < state.blades.length; i += 1) {
      const b = state.blades[i];
      const bx = p.x + Math.cos(b.angle) * 78;
      const by = p.y + Math.sin(b.angle) * 78;
      if (b.hitCd > 0) continue;
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (e.spawnT > 0 || e.bladeCd > 0) continue;
        const rr = 12 + e.r;
        if (dist2(bx, by, e.x, e.y) < rr * rr) {
          e.hp -= dmg;
          e.flash = 0.12;
          e.bladeCd = 0.45;
          b.hitCd = 0.12;
          floater(e.x, e.y - e.r - 4, String(Math.round(dmg)), '#9be8ff');
          if (e.hp <= 0) killEnemy(j);
          break;
        }
      }
    }
  }

  function stepOrbs(dt) {
    const p = state.player;
    let events = 0;
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const o = state.orbs[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      let dead = o.life <= 0 || o.x < -20 || o.x > state.w + 20 || o.y < -20 || o.y > state.h + 20;
      if (!dead) {
        const rr = o.r + p.r;
        if (dist2(o.x, o.y, p.x, p.y) < rr * rr) {
          events |= hurtPlayer(o.dmg);
          dead = true;
        }
      }
      if (dead) state.orbs.splice(i, 1);
    }
    return events;
  }

  function stepGems(dt) {
    const p = state.player;
    const magnetR = PLAYER.magnet * state.stats.magnetMult;
    let events = 0;
    for (let i = state.gems.length - 1; i >= 0; i -= 1) {
      const g = state.gems[i];
      const d = Math.hypot(p.x - g.x, p.y - g.y) || 1;
      if (d < magnetR) {
        const pull = GEM_MAGNET_PULL * (1 - d / (magnetR + 1));
        g.vx += ((p.x - g.x) / d) * pull * dt * 6;
        g.vy += ((p.y - g.y) / d) * pull * dt * 6;
      } else {
        g.vx *= 0.96;
        g.vy *= 0.96;
      }
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d < p.r + 16) {
        state.gems.splice(i, 1);
        if (g.heart) {
          p.hp = Math.min(p.maxHp, p.hp + 20);
          floater(p.x, p.y - 24, '+20 HP', '#7dff9a');
          burst(g.x, g.y, '#7dff9a', 8, 120);
        } else {
          burst(g.x, g.y, '#ffe9a8', 4, 80);
          events |= gainXp(g.val);
        }
        events |= EVENT_PICKUP;
      }
    }
    return events;
  }

  function stepSpawning(dt) {
    if (state.waveState === 'clear') {
      state.clearTimer -= dt;
      if (state.clearTimer <= 0) startWave(state.wave + 1);
      return;
    }
    if (state.spawnQueue > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = spawnInterval(state.wave);
        state.spawnQueue -= 1;
        if (state.wave % 5 === 0 && state.spawnQueue === waveBudget(state.wave) - 1) {
          spawnEnemy('bulwark', true);
        } else {
          spawnEnemy(pickKind(), false);
        }
      }
    } else if (state.enemies.length === 0) {
      const bonus = 25 * state.wave;
      state.score += bonus;
      state.waveState = 'clear';
      state.clearTimer = 2.5;
      setBanner(`WAVE ${state.wave} CLEAR`, `Bonus +${bonus}  •  next wave incoming`, 2.5);
    }
  }

  function stepFx(dt) {
    for (let i = state.parts.length - 1; i >= 0; i -= 1) {
      const pt = state.parts[i];
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
      pt.life -= dt;
      if (pt.life <= 0) state.parts.splice(i, 1);
    }
    for (let i = state.floats.length - 1; i >= 0; i -= 1) {
      const f = state.floats[i];
      f.y -= 42 * dt;
      f.life -= dt;
      if (f.life <= 0) state.floats.splice(i, 1);
    }
    if (state.bannerTimer > 0) state.bannerTimer -= dt;
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 30);
    if (state.flash > 0) state.flash -= dt;
    if (state.comboTimer > 0) {
      state.comboTimer -= dt;
      if (state.comboTimer <= 0) state.combo = 0;
    }
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.wave = 1;
    state.combo = 0;
    state.comboTimer = 0;
    state.player = freshPlayer();
    state.bullets = [];
    state.enemies = [];
    state.orbs = [];
    state.gems = [];
    state.parts = [];
    state.floats = [];
    state.blades = [];
    state.spawnQueue = 0;
    state.spawnTimer = 0;
    state.waveState = 'fighting';
    state.clearTimer = 0;
    state.banner = null;
    state.bannerTimer = 0;
    state.shake = 0;
    state.flash = 0;
    state.over = false;
    state.pendingChoices = null;
    state.upgrades = {};
    state.stats = deriveStats({});
    state.attract = false;
    startWave(1);
  }

  reset();

  return {
    state,
    reset,
    /** Grant XP through the real level-up path (used by tests and the autopilot). */
    grantXp(amount) {
      return gainXp(amount);
    },
    resize(w, h) {
      state.w = w;
      state.h = h;
      if (state.player) {
        state.player.x = Math.max(state.player.r, Math.min(w - state.player.r, state.player.x));
        state.player.y = Math.max(state.player.r, Math.min(h - state.player.r, state.player.y));
      }
    },
    /** Apply a level-up choice and resume play. */
    chooseUpgrade(id) {
      if (!state.pendingChoices) return false;
      applyChoice(state, id);
      state.pendingChoices = null;
      syncBlades(state);
      return true;
    },
    /**
     * Advance the world one step. `move` is {x, y} (-1..1); `dash` asks for a dash.
     * With `attract` the player cannot die and the world just drifts for the title
     * screen. Returns event bits; while a level-up waits or the run is over, it
     * only ages the visual effects.
     */
    step(dt, move, dash, attract = false) {
      state.attract = attract;
      if (state.over || state.pendingChoices) {
        stepFx(dt);
        return 0;
      }
      state.time += dt;
      let events = 0;
      stepPlayer(dt, move, dash);
      stepEnemies(dt);
      stepBullets(dt);
      stepBlades(dt);
      const orbEvents = stepOrbs(dt);
      events |= orbEvents;
      events |= stepGems(dt);
      stepSpawning(dt);
      stepFx(dt);
      // Player contact damage (enemies that reached the player).
      if (!state.over && !state.attract) {
        const p = state.player;
        for (let i = 0; i < state.enemies.length; i += 1) {
          const e = state.enemies[i];
          if (e.spawnT > 0) continue;
          const rr = e.r + p.r - 2;
          if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
            const ev = hurtPlayer(e.damage);
            events |= ev;
            if (ev & EVENT_OVER) break;
          }
        }
      }
      if (state.over) events |= EVENT_OVER;
      return events;
    },
  };
}
