// Keyboard and mouse input. Held keys give a steering vector; one-shot presses (start,
// pause, enter/exit a car, punch, switch weapon) are queued as bit flags and taken once by
// the loop, so a press between two frames is never lost and never counted twice. The mouse
// position is kept in canvas pixels for aiming.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER_CAR = 4;
export const ACTION_PUNCH = 8;
export const ACTION_WEAPON = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER_CAR = new Set(['KeyE']);
const WEAPON = new Set(['KeyQ']);

export function createInput(target) {
  const keys = { up: false, down: false, left: false, right: false };
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;

  function mark(code, value) {
    if (UP.has(code)) keys.up = value;
    else if (DOWN.has(code)) keys.down = value;
    else if (LEFT.has(code)) keys.left = value;
    else if (RIGHT.has(code)) keys.right = value;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      mark(event.code, true);
      event.preventDefault();
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (ENTER_CAR.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER_CAR;
      event.preventDefault();
    } else if (WEAPON.has(event.code)) {
      if (!event.repeat) actions |= ACTION_WEAPON;
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    mark(event.code, false);
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    keys.up = false;
    keys.down = false;
    keys.left = false;
    keys.right = false;
    mouseDown = false;
  });
  target.addEventListener('pointermove', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  target.addEventListener('pointerdown', (event) => {
    const rect = target.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    actions |= ACTION_CONFIRM;
  });
  target.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  return {
    /** Steering: x is -1/0/1 (left/right), y is -1/0/1 (up/down). */
    steering() {
      return {
        x: (keys.right ? 1 : 0) - (keys.left ? 1 : 0),
        y: (keys.down ? 1 : 0) - (keys.up ? 1 : 0),
      };
    },
    /** Mouse position in canvas pixels, for aiming. */
    mouse() {
      return { x: mouseX, y: mouseY, down: mouseDown };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
