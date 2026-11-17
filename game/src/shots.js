// The screenshot scenes behind ?shot=start|play|levelup|end. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot (keep clear of enemies, chase the nearest gem, dash when cornered), so the
// frame is what a short game really looks like and the same seed always gives the same
// frame. The end scene's pilot is deliberately reckless, so it is caught out.
import { STEP } from './config.js';
import { SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 4;
const PLAY_SECONDS = 42;
const LIMIT_SECONDS = 300;
const SAMPLE = 1 / 30;

/** Steer: away from close enemies, toward the nearest gem, else toward the centre. */
function autopilot(state, reckless) {
  const p = state.player;
  let mx = 0;
  let my = 0;
  let dash = false;
  // Flee the nearest enemy inside the danger radius.
  let threat = null;
  let threatD = reckless ? 55 : 110;
  for (const e of state.enemies) {
    if (e.spawnT > 0) continue;
    const d = Math.hypot(e.x - p.x, e.y - p.y);
    if (d < threatD) {
      threatD = d;
      threat = e;
    }
  }
  if (threat) {
    const d = Math.hypot(threat.x - p.x, threat.y - p.y) || 1;
    mx = (p.x - threat.x) / d;
    my = (p.y - threat.y) / d;
    if (threatD < 46) dash = true;
  } else {
    let gem = null;
    let gemD = reckless ? 0 : 200;
    for (const g of state.gems) {
      const d = Math.hypot(g.x - p.x, g.y - p.y);
      if (d < gemD) {
        gemD = d;
        gem = g;
      }
    }
    if (gem) {
      const d = Math.hypot(gem.x - p.x, gem.y - p.y) || 1;
      mx = (gem.x - p.x) / d;
      my = (gem.y - p.y) / d;
    } else {
      // Drift toward the centre so the ship stays in frame.
      const cx = state.w / 2;
      const cy = state.h / 2;
      const d = Math.hypot(cx - p.x, cy - p.y);
      if (d > 60) {
        mx = (cx - p.x) / d;
        my = (cy - p.y) / d;
      }
    }
  }
  return { move: { x: mx, y: my }, dash: reckless ? false : dash };
}

/**
 * Set `world` to the named scene (start, play, levelup or end; any other name is
 * start) and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  world.reset();
  if (name !== 'play' && name !== 'levelup' && name !== 'end') {
    world.state.attract = true;
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { x: 0.3, y: 0.1 }, false, true);
    }
    return { screen: SCREEN_TITLE, best: 0 };
  }
  const reckless = name === 'end';
  const limit = name === 'play' ? PLAY_SECONDS : LIMIT_SECONDS;
  let screen = SCREEN_PLAY;
  for (let i = 0; i < limit / STEP; i += 1) {
    const pilot = autopilot(world.state, reckless);
    world.step(STEP, pilot.move, pilot.dash, false);
    if (world.state.over) {
      screen = SCREEN_OVER;
      break;
    }
    if (world.state.pendingChoices) {
      if (name === 'play' || reckless) {
        // The play scene keeps rolling through level-ups; the end scene's pilot
        // takes the first upgrade and keeps dying.
        world.chooseUpgrade(world.state.pendingChoices[0]);
      } else {
        screen = SCREEN_LEVELUP;
        break;
      }
    }
  }
  if (name === 'levelup' && screen !== SCREEN_LEVELUP) {
    // A cautious pilot can take a while to level; keep going until it does.
    for (let i = 0; i < LIMIT_SECONDS / STEP && screen !== SCREEN_LEVELUP; i += 1) {
      const pilot = autopilot(world.state, false);
      world.step(STEP, pilot.move, pilot.dash, false);
      if (world.state.pendingChoices) screen = SCREEN_LEVELUP;
      if (world.state.over) break;
    }
  }
  return { screen, best: world.state.score };
}
