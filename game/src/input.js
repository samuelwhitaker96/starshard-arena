// Keyboard and mouse state. The game reads a movement direction each step and takes
// one-shot actions (confirm, pause, dash, mute, upgrade 1/2/3) out of a queue, so a
// key pressed between steps is never lost and a held key never repeats an action.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_DASH = 4;
export const ACTION_MUTE = 8;
export const ACTION_CHOICE_1 = 16;
export const ACTION_CHOICE_2 = 32;
export const ACTION_CHOICE_3 = 64;

const KEY_ACTIONS = {
  Enter: ACTION_CONFIRM,
  Space: ACTION_CONFIRM | ACTION_DASH,
  KeyP: ACTION_PAUSE,
  Escape: ACTION_PAUSE,
  KeyM: ACTION_MUTE,
  KeyR: ACTION_CONFIRM,
  Digit1: ACTION_CHOICE_1,
  Digit2: ACTION_CHOICE_2,
  Digit3: ACTION_CHOICE_3,
  Numpad1: ACTION_CHOICE_1,
  Numpad2: ACTION_CHOICE_2,
  Numpad3: ACTION_CHOICE_3,
};
const MOVE_KEYS = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let clicks = [];
  let mouse = { x: 0, y: 0 };

  function onKeyDown(event) {
    if (event.repeat) return;
    const action = KEY_ACTIONS[event.code];
    if (action !== undefined) {
      actions |= action;
      event.preventDefault();
    }
    if (MOVE_KEYS[event.code]) {
      keys.add(event.code);
      event.preventDefault();
    }
  }
  function onKeyUp(event) {
    keys.delete(event.code);
  }
  function onMouseMove(event) {
    const rect = canvas.getBoundingClientRect();
    mouse = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function onMouseDown(event) {
    const rect = canvas.getBoundingClientRect();
    const point = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    mouse = point;
    clicks.push(point);
  }

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mousedown', onMouseDown);

  return {
    /** Normalised movement direction from the held keys, {x, y} in [-1, 1]. */
    direction() {
      let x = 0;
      let y = 0;
      keys.forEach((code) => {
        const d = MOVE_KEYS[code];
        if (d) {
          x += d[0];
          y += d[1];
        }
      });
      const len = Math.hypot(x, y);
      return len > 0 ? { x: x / len, y: y / len } : { x: 0, y: 0 };
    },
    /** One-shot actions queued since the last call; the queue is then cleared. */
    takeActions() {
      const out = actions;
      actions = 0;
      return out;
    },
    /** Mouse clicks since the last call, as {x, y} in canvas pixels. */
    takeClicks() {
      const out = clicks;
      clicks = [];
      return out;
    },
    get mouse() {
      return mouse;
    },
    /** True while the dash key (Shift) is held. */
    get dashHeld() {
      return keys.has('ShiftLeft') || keys.has('ShiftRight');
    },
  };
}
