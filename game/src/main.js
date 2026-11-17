// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between five screens: title, play, level-up, paused and over.
//
// ?seed=N fixes the run. ?shot=start|play|levelup|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot. window.__starshard exposes the live state for testing and debugging.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './rng.js';
import { createAudio } from './audio.js';
import {
  ACTION_CHOICE_1, ACTION_CHOICE_2, ACTION_CHOICE_3, ACTION_CONFIRM,
  ACTION_DASH, ACTION_MUTE, ACTION_PAUSE, createInput,
} from './input.js';
import { createWorld, EVENT_HIT, EVENT_LEVELUP, EVENT_OVER, EVENT_PICKUP, EVENT_WAVE } from './world.js';
import {
  SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE,
  cardRects, createRenderer, overRestartRect, titleStartRect,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const size = renderer.resize();
  world.resize(size.w, size.h);
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, { x: -1, y: -1 });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let isNewBest = false;
  let accumulator = 0;
  let last = performance.now();
  let dashQueued = false;

  function resize() {
    const size = renderer.resize();
    world.resize(size.w, size.h);
  }
  resize();
  window.addEventListener('resize', resize);

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    audio.click();
    world.reset();
    resize();
    accumulator = 0;
    screen = SCREEN_PLAY;
    isNewBest = false;
    announce('Playing. Survive the waves, collect star shards, level up.');
  }

  function endGame() {
    audio.gameover();
    screen = SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      isNewBest = true;
      saveBest(best);
    }
    announce(`Game over. Score ${world.state.score}. Best ${best}.`);
  }

  function pickUpgrade(index) {
    const choices = world.state.pendingChoices;
    if (!choices || index >= choices.length) return;
    audio.click();
    audio.levelup();
    world.chooseUpgrade(choices[index]);
    screen = SCREEN_PLAY;
    announce(`Upgrade taken. Level ${world.state.player.level}.`);
  }

  function hitTest(point, rect) {
    return point.x >= rect.x && point.x <= rect.x + rect.w && point.y >= rect.y && point.y <= rect.y + rect.h;
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Sound off.' : 'Sound on.');
    }
    if (screen === SCREEN_PLAY && (actions & ACTION_DASH)) dashQueued = true;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_OVER) {
      if (actions & ACTION_CONFIRM) startGame();
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (screen === SCREEN_LEVELUP) {
      if (actions & ACTION_CHOICE_1) pickUpgrade(0);
      else if (actions & ACTION_CHOICE_2) pickUpgrade(1);
      else if (actions & ACTION_CHOICE_3) pickUpgrade(2);
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    }
    // Mouse clicks on buttons and cards.
    for (const point of input.takeClicks()) {
      audio.unlock();
      if (screen === SCREEN_TITLE && hitTest(point, titleStartRect(renderer.width, renderer.height))) {
        startGame();
      } else if (screen === SCREEN_OVER && hitTest(point, overRestartRect(renderer.width, renderer.height))) {
        startGame();
      } else if (screen === SCREEN_LEVELUP) {
        const rects = cardRects(renderer.width, renderer.height);
        for (let i = 0; i < rects.length; i += 1) {
          if (hitTest(point, rects[i])) pickUpgrade(i);
        }
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { x: Math.sin(world.state.time * 0.4) * 0.4, y: Math.cos(world.state.time * 0.3) * 0.3 }, false, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const dash = input.dashHeld || dashQueued;
    dashQueued = false;
    const events = world.step(STEP, input.direction(), dash, false);
    if (events & EVENT_OVER) endGame();
    else if (events & EVENT_LEVELUP) {
      audio.levelup();
      screen = SCREEN_LEVELUP;
      announce('Level up! Choose an upgrade.');
    } else if (events & EVENT_HIT) {
      audio.hurt();
      announce(`Hit. ${Math.ceil(world.state.player.hp)} HP left.`);
    }
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_WAVE) audio.wave();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    // A level-up can be raised outside the step loop (debug grant); catch it here.
    if (screen === SCREEN_PLAY && world.state.pendingChoices) {
      audio.levelup();
      screen = SCREEN_LEVELUP;
      announce('Level up! Choose an upgrade.');
    }
    // Dash is a held-key action read inside step(); Space also queues ACTION_DASH.
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, input.mouse, isNewBest);
  }

  // Leaving the tab pauses a running game rather than letting enemies close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  // Space also dashes in play: the queued dash action is read in step() above.
  window.__starshard = {
    get state() { return world.state; },
    get screen() { return screen; },
    get best() { return best; },
    debug: {
      addXp(n) { world.grantXp(n); },
      damagePlayer(n) {
        world.state.player.invuln = 0;
        world.state.player.hp -= n;
        if (world.state.player.hp <= 0) {
          world.state.player.hp = 0;
          world.state.over = true;
          screen = SCREEN_OVER;
        }
      },
      start() { startGame(); },
    },
  };

  announce('Starshard Arena. Press Enter or click Start to play.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
