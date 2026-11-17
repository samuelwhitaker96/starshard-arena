// Everything the player sees: the arena, the entities, the HUD and the four screens
// (title, play, level-up, paused, game over). It only reads state and draws it; it
// never changes the game. Interactive rects are exported so the shell can hit-test
// clicks against exactly what was drawn.
import { UPGRADES } from './upgrades.js';
import { createRandom } from './rng.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const FONT = 'system-ui, "Segoe UI", sans-serif';

export function titleStartRect(w, h) {
  return { x: w / 2 - 170, y: h * 0.68, w: 340, h: 56 };
}
export function overRestartRect(w, h) {
  return { x: w / 2 - 170, y: h * 0.72, w: 340, h: 56 };
}
export function cardRects(w, h) {
  const cw = 230;
  const ch = 250;
  const gap = 24;
  const total = cw * 3 + gap * 2;
  const x0 = (w - total) / 2;
  const y = h / 2 - ch / 2 + 20;
  return [0, 1, 2].map((i) => ({ x: x0 + i * (cw + gap), y, w: cw, h: ch }));
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtTime(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let w = 0;
  let h = 0;
  let dpr = 1;
  // A fixed starfield and nebula so the arena reads the same every visit.
  const starRng = createRandom(1337);
  const stars = [];
  for (let i = 0; i < 130; i += 1) {
    stars.push({ x: starRng.next(), y: starRng.next(), r: 0.5 + starRng.next() * 1.6, tw: starRng.next() * Math.PI * 2 });
  }
  const nebulae = [
    { x: 0.2, y: 0.25, r: 0.42, c: 'rgba(88, 60, 180, 0.20)' },
    { x: 0.82, y: 0.2, r: 0.36, c: 'rgba(24, 110, 160, 0.18)' },
    { x: 0.7, y: 0.85, r: 0.45, c: 'rgba(160, 50, 110, 0.14)' },
    { x: 0.12, y: 0.8, r: 0.3, c: 'rgba(30, 90, 140, 0.16)' },
  ];

  // The static background (gradient, nebulae, grid) is painted once per resize into
  // an offscreen canvas and blitted each frame: re-creating its gradients every frame
  // is the slowest part of drawing under a software rasteriser.
  let bgCanvas = null;
  function paintBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.round(w * dpr);
    bgCanvas.height = Math.round(h * dpr);
    const b = bgCanvas.getContext('2d');
    b.setTransform(dpr, 0, 0, dpr, 0, 0);
    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0a0e22');
    g.addColorStop(0.55, '#070a18');
    g.addColorStop(1, '#0b0716');
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);
    for (const n of nebulae) {
      const rg = b.createRadialGradient(n.x * w, n.y * h, 0, n.x * w, n.y * h, n.r * Math.max(w, h));
      rg.addColorStop(0, n.c);
      rg.addColorStop(1, 'rgba(0,0,0,0)');
      b.fillStyle = rg;
      b.fillRect(0, 0, w, h);
    }
    b.strokeStyle = 'rgba(120, 160, 255, 0.05)';
    b.lineWidth = 1;
    b.beginPath();
    for (let x = 0; x <= w; x += 64) { b.moveTo(x, 0); b.lineTo(x, h); }
    for (let y = 0; y <= h; y += 64) { b.moveTo(0, y); b.lineTo(w, y); }
    b.stroke();
  }

  /** A cheap glow: a soft translucent disc behind a shape (shadowBlur is slow). */
  function halo(x, y, r, color, alpha = 0.25) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.max(320, rect.width);
    h = Math.max(240, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintBackground();
    return { w, h };
  }

  function drawBackground(time) {
    ctx.drawImage(bgCanvas, 0, 0, w, h);
    for (const s of stars) {
      const a = 0.35 + 0.4 * Math.abs(Math.sin(time * 0.7 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = '#cfe4ff';
      ctx.beginPath();
      ctx.arc(s.x * w, s.y * h, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawGem(g) {
    ctx.save();
    ctx.translate(g.x, g.y);
    if (g.heart) {
      ctx.fillStyle = '#ff5e7a';
      ctx.font = '20px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('♥', 0, 1);
    } else {
      ctx.rotate(Math.PI / 4);
      const s = g.val === 3 ? 9 : g.val === 2 ? 7 : 5;
      halo(0, 0, s + 8, '#ffd76a', 0.3);
      ctx.fillStyle = g.val === 3 ? '#ffd76a' : g.val === 2 ? '#ffcf5e' : '#c9a227';
      ctx.fillRect(-s / 2, -s / 2, s, s);
    }
    ctx.restore();
  }

  function drawEnemy(e) {
    const alpha = e.spawnT > 0 ? 1 - e.spawnT / 0.45 : 1;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(e.x, e.y);
    if (e.spawnT > 0) {
      ctx.strokeStyle = e.color;
      ctx.globalAlpha = alpha * 0.7;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, e.r + (0.45 - e.spawnT) * 60, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = alpha;
    }
    halo(0, 0, e.r + 10, e.color, 0.3);
    ctx.fillStyle = e.color;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    if (e.kind === 'wisp') {
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2;
        const r = i % 2 === 0 ? e.r + 5 : e.r - 2;
        ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
      }
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'dart') {
      ctx.beginPath();
      ctx.moveTo(e.r + 4, 0);
      ctx.lineTo(-e.r, e.r * 0.8);
      ctx.lineTo(-e.r * 0.4, 0);
      ctx.lineTo(-e.r, -e.r * 0.8);
      ctx.closePath();
      ctx.fill();
    } else if (e.kind === 'splitter') {
      ctx.beginPath();
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    } else if (e.kind === 'spitter') {
      ctx.beginPath();
      ctx.moveTo(0, -e.r);
      ctx.lineTo(e.r, 0);
      ctx.lineTo(0, e.r);
      ctx.lineTo(-e.r, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#0b2b26';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
      if (e.telegraph > 0) {
        ctx.strokeStyle = '#ffffff';
        ctx.globalAlpha = alpha * (0.5 + 0.5 * Math.sin(e.telegraph * 40));
        ctx.beginPath();
        ctx.arc(0, 0, e.r + 8, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      for (let i = 0; i < 8; i += 1) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        ctx.lineTo(Math.cos(a) * e.r, Math.sin(a) * e.r);
      }
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.arc(0, 0, e.r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (e.flash > 0) {
      ctx.globalAlpha = alpha * Math.min(1, e.flash * 8);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, e.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    if (e.hp < e.maxHp) {
      const bw = Math.max(28, e.r * 2);
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw, 5);
      ctx.fillStyle = e.elite ? '#ffcf3d' : '#ff5e5e';
      ctx.fillRect(e.x - bw / 2, e.y - e.r - 12, bw * Math.max(0, e.hp / e.maxHp), 5);
    }
    if (e.elite) {
      ctx.fillStyle = '#ffcf3d';
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('ELITE', e.x, e.y - e.r - 18);
    }
  }

  function drawPlayer(p, time) {
    ctx.save();
    ctx.translate(p.x, p.y);
    if (p.invuln > 0 && Math.floor(time * 14) % 2 === 0) ctx.globalAlpha = 0.45;
    halo(0, 0, p.r + 14, '#7fe7ff', 0.3);
    ctx.rotate(p.face);
    if (p.moving) {
      ctx.fillStyle = '#ff9a3d';
      ctx.beginPath();
      ctx.moveTo(-p.r - 2, -5);
      ctx.lineTo(-p.r - 12 - Math.random() * 6, 0);
      ctx.lineTo(-p.r - 2, 5);
      ctx.closePath();
      ctx.fill();
    }
    const grad = ctx.createLinearGradient(-p.r, 0, p.r + 6, 0);
    grad.addColorStop(0, '#9be8ff');
    grad.addColorStop(1, '#ffffff');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(p.r + 8, 0);
    ctx.lineTo(-p.r - 2, p.r * 0.75);
    ctx.lineTo(-p.r * 0.45, 0);
    ctx.lineTo(-p.r - 2, -p.r * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0a2a3a';
    ctx.beginPath();
    ctx.arc(2, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (p.dashTimer > 0) {
      ctx.strokeStyle = 'rgba(127, 231, 255, 0.7)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 8, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawHud(state, screen) {
    const p = state.player;
    ctx.textBaseline = 'alphabetic';
    // Top-left: health and XP.
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, 14, 12, 220, 44, 8);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px ' + FONT;
    ctx.fillText(`HP  ${Math.ceil(p.hp)} / ${p.maxHp}`, 24, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 24, 36, 200, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ff5e7a';
    roundRect(ctx, 24, 36, 200 * Math.max(0, p.hp / p.maxHp), 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px ' + FONT;
    ctx.fillText(`LV ${p.level}`, 24, 68);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    roundRect(ctx, 60, 59, 164, 8, 4);
    ctx.fill();
    ctx.fillStyle = '#ffd76a';
    roundRect(ctx, 60, 59, 164 * Math.max(0, Math.min(1, p.xp / p.xpNext)), 8, 4);
    ctx.fill();
    // Top-centre: wave and time.
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText(`WAVE ${state.wave}`, w / 2, 34);
    ctx.font = '13px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(fmtTime(state.time), w / 2, 54);
    // Top-right: score, kills, combo.
    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px ' + FONT;
    ctx.fillText(`${state.score}`, w - 24, 32);
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText(`KILLS ${state.kills}`, w - 24, 50);
    if (state.combo >= 2) {
      ctx.fillStyle = '#ffcf3d';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText(`COMBO x${state.combo}`, w - 24, 70);
    }
    // Bottom-left: dash and mute.
    ctx.textAlign = 'left';
    ctx.font = '12px ' + FONT;
    ctx.fillStyle = p.dashCd <= 0 ? '#7fe7ff' : 'rgba(255,255,255,0.45)';
    ctx.fillText(p.dashCd <= 0 ? 'DASH READY  [Space / Shift]' : `DASH ${p.dashCd.toFixed(1)}s`, 16, h - 16);
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('WASD move  •  auto-fire  •  P pause  •  M mute', w - 16, h - 16);
    // Banner (only over live play, never over a menu screen).
    if (screen === SCREEN_PLAY && state.banner && state.bannerTimer > 0) {
      const a = Math.min(1, state.bannerTimer);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px ' + FONT;
      ctx.shadowColor = '#7f6cff';
      ctx.shadowBlur = 24;
      ctx.fillText(state.banner.text, w / 2, h * 0.3);
      ctx.shadowBlur = 0;
      ctx.font = '16px ' + FONT;
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(state.banner.sub, w / 2, h * 0.3 + 30);
      ctx.globalAlpha = 1;
    }
    // Damage flash.
    if (state.flash > 0) {
      const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7);
      g.addColorStop(0, 'rgba(255,40,60,0)');
      g.addColorStop(1, `rgba(255,40,60,${Math.min(0.5, state.flash)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawTitle(state, best, time) {
    ctx.fillStyle = 'rgba(4, 6, 16, 0.62)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 64px ' + FONT;
    ctx.shadowColor = '#7f6cff';
    ctx.shadowBlur = 30;
    ctx.fillText('STARSHARD', w / 2, h * 0.3);
    ctx.fillText('ARENA', w / 2, h * 0.3 + 68);
    ctx.shadowBlur = 0;
    ctx.font = '17px ' + FONT;
    ctx.fillStyle = '#ffd76a';
    ctx.fillText('A neon roguelite arena  •  survive the waves, forge your build', w / 2, h * 0.3 + 108);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '15px ' + FONT;
    ctx.fillText('WASD / arrows — move      Space / Shift — dash      Auto-fire is always on', w / 2, h * 0.52);
    ctx.fillText('Collect star shards to level up and choose upgrades  •  P pause  •  M mute', w / 2, h * 0.52 + 26);
    if (best > 0) {
      ctx.fillStyle = '#ffcf3d';
      ctx.font = 'bold 16px ' + FONT;
      ctx.fillText(`BEST SCORE  ${best}`, w / 2, h * 0.52 + 58);
    }
    const r = titleStartRect(w, h);
    const pulse = 0.75 + 0.25 * Math.sin(time * 4);
    ctx.globalAlpha = pulse;
    ctx.fillStyle = '#ffd76a';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#23180a';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('▶  START  —  press Enter', w / 2, r.y + 36);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = '12px ' + FONT;
    ctx.fillText('v1.0  •  an original game  •  best played with sound on', w / 2, h - 18);
  }

  function drawLevelUp(state, mouse) {
    ctx.fillStyle = 'rgba(4, 6, 16, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd76a';
    ctx.font = 'bold 40px ' + FONT;
    ctx.shadowColor = '#ffd76a';
    ctx.shadowBlur = 22;
    ctx.fillText('LEVEL UP!', w / 2, h / 2 - 170);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = '16px ' + FONT;
    ctx.fillText('Choose one upgrade — press 1, 2 or 3, or click a card', w / 2, h / 2 - 138);
    const rects = cardRects(w, h);
    state.pendingChoices.forEach((id, i) => {
      const r = rects[i];
      const hover = mouse && mouse.x >= r.x && mouse.x <= r.x + r.w && mouse.y >= r.y && mouse.y <= r.y + r.h;
      ctx.fillStyle = hover ? 'rgba(60, 50, 110, 0.95)' : 'rgba(22, 26, 54, 0.95)';
      roundRect(ctx, r.x, r.y, r.w, r.h, 14);
      ctx.fill();
      ctx.strokeStyle = hover ? '#ffd76a' : 'rgba(140, 160, 255, 0.4)';
      ctx.lineWidth = hover ? 3 : 2;
      ctx.stroke();
      if (id === 'heal' || id === 'riches') {
        ctx.fillStyle = id === 'heal' ? '#7dff9a' : '#ffd76a';
        ctx.font = '52px ' + FONT;
        ctx.fillText(id === 'heal' ? '♥' : '$', r.x + r.w / 2, r.y + 78);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px ' + FONT;
        ctx.fillText(id === 'heal' ? 'Second Wind' : 'Star Cache', r.x + r.w / 2, r.y + 128);
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.font = '14px ' + FONT;
        ctx.fillText(id === 'heal' ? 'Restore 40 HP now' : '+150 score now', r.x + r.w / 2, r.y + 158);
      } else {
        const up = UPGRADES[id];
        const lvl = (state.upgrades[id] || 0) + 1;
        ctx.fillStyle = '#ffd76a';
        ctx.font = '52px ' + FONT;
        ctx.fillText(up.glyph, r.x + r.w / 2, r.y + 78);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 19px ' + FONT;
        ctx.fillText(up.name, r.x + r.w / 2, r.y + 128);
        ctx.fillStyle = '#ffcf3d';
        ctx.font = '13px ' + FONT;
        ctx.fillText('●'.repeat(lvl) + '○'.repeat(up.max - lvl), r.x + r.w / 2, r.y + 154);
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.font = '14px ' + FONT;
        ctx.fillText(up.text, r.x + r.w / 2, r.y + 182);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.font = 'bold 15px ' + FONT;
      ctx.fillText(`[${i + 1}]`, r.x + r.w / 2, r.y + r.h - 18);
    });
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(4, 6, 16, 0.66)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px ' + FONT;
    ctx.fillText('PAUSED', w / 2, h / 2 - 10);
    ctx.font = '16px ' + FONT;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('Press P or Enter to resume', w / 2, h / 2 + 26);
  }

  function drawOver(state, best, isNewBest) {
    ctx.fillStyle = 'rgba(8, 4, 12, 0.72)';
    ctx.fillRect(0, 0, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ff5e7a';
    ctx.font = 'bold 52px ' + FONT;
    ctx.shadowColor = '#ff5e7a';
    ctx.shadowBlur = 24;
    ctx.fillText('THE ARENA FALLS', w / 2, h * 0.26);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 30px ' + FONT;
    ctx.fillText(`SCORE  ${state.score}`, w / 2, h * 0.26 + 58);
    if (isNewBest) {
      ctx.fillStyle = '#ffcf3d';
      ctx.font = 'bold 17px ' + FONT;
      ctx.fillText('★ NEW BEST SCORE ★', w / 2, h * 0.26 + 88);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '17px ' + FONT;
    const rows = [
      `Wave reached: ${state.wave}`,
      `Enemies destroyed: ${state.kills}`,
      `Time survived: ${fmtTime(state.time)}`,
      `Best score: ${best}`,
    ];
    rows.forEach((row, i) => ctx.fillText(row, w / 2, h * 0.44 + i * 28));
    const r = overRestartRect(w, h);
    ctx.fillStyle = '#ffd76a';
    roundRect(ctx, r.x, r.y, r.w, r.h, 12);
    ctx.fill();
    ctx.fillStyle = '#23180a';
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('↻  PLAY AGAIN  —  press R', w / 2, r.y + 36);
  }

  return {
    resize,
    get width() { return w; },
    get height() { return h; },
    /** Paint the whole frame for `screen`, with the world behind it. */
    draw(state, screen, best, mouse, isNewBest = false) {
      const time = state.time;
      ctx.save();
      if (state.shake > 0) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      drawBackground(time);
      for (const g of state.gems) drawGem(g);
      for (const e of state.enemies) drawEnemy(e);
      for (const o of state.orbs) {
        halo(o.x, o.y, o.r + 8, '#3fd9c0', 0.3);
        ctx.fillStyle = '#7fffd4';
        ctx.beginPath();
        ctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        ctx.fill();
      }
      // Orbiting blades.
      const p = state.player;
      for (let i = 0; i < state.blades.length; i += 1) {
        const b = state.blades[i];
        const bx = p.x + Math.cos(b.angle) * 78;
        const by = p.y + Math.sin(b.angle) * 78;
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(b.angle + Math.PI / 2);
        ctx.fillStyle = '#9be8ff';
        halo(0, 0, 16, '#9be8ff', 0.3);
        ctx.fillStyle = '#9be8ff';
        ctx.beginPath();
        ctx.moveTo(0, -12);
        ctx.lineTo(7, 8);
        ctx.lineTo(0, 3);
        ctx.lineTo(-7, 8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      // Bullets.
      for (const b of state.bullets) {
        ctx.strokeStyle = 'rgba(255, 215, 106, 0.5)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(b.x - b.vx * 0.03, b.y - b.vy * 0.03);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        halo(b.x, b.y, b.r + 7, '#ffd76a', 0.35);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (p) drawPlayer(p, time);
      for (const pt of state.parts) {
        ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const f of state.floats) {
        ctx.globalAlpha = Math.max(0, f.life / 0.8);
        ctx.fillStyle = f.color;
        ctx.font = 'bold 14px ' + FONT;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      if (screen === SCREEN_PLAY || screen === SCREEN_LEVELUP || screen === SCREEN_PAUSED) drawHud(state, screen);
      if (screen === SCREEN_TITLE) drawTitle(state, best, time);
      else if (screen === SCREEN_LEVELUP) drawLevelUp(state, mouse);
      else if (screen === SCREEN_PAUSED) drawPaused();
      else if (screen === SCREEN_OVER) drawOver(state, best, isNewBest);
    },
  };
}
