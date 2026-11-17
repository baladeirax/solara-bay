// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between four screens: title, play, paused and game over.
//
// ?seed=N fixes the city and the traffic. ?shot=start|chase|mission|drive (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.

import { STEP, SAVE_KEY, BEST_KEY } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_WASTED, EVENT_BUSTED, EVENT_MISSION_DONE, EVENT_PICKUP, EVENT_SHOT, EVENT_CRASH, EVENT_PUNCH, EVENT_WANTED_UP } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, ACTION_ENTER_CAR, ACTION_WEAPON, createInput } from './input.js';
import { createRenderer, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
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

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { cash: 0, missions: 0, best: 0 };
    const parsed = JSON.parse(raw);
    return {
      cash: Number(parsed.cash) || 0,
      missions: Number(parsed.missions) || 0,
      best: Number(parsed.best) || 0,
    };
  } catch {
    return { cash: 0, missions: 0, best: 0 };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.save);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  save.best = Math.max(save.best, readBest());
  let accumulator = 0;
  let last = performance.now();

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    audio.unlock();
    world.reset();
    world.state.cash = save.cash;
    accumulator = 0;
    screen = SCREEN_PLAY;
    announce('Playing Solara Bay. Follow the yellow marker.');
  }

  function endGame() {
    screen = SCREEN_OVER;
    const earned = world.state.earned;
    save.cash = world.state.cash;
    save.missions = Math.max(save.missions, world.state.mission + (world.state.victory ? 1 : 0));
    save.best = Math.max(save.best, earned);
    writeSave(save);
    try {
      window.localStorage.setItem(BEST_KEY, String(save.best));
    } catch {
      // Best score is a nicety, not a requirement.
    }
    if (world.state.overReason === 'busted') {
      audio.busted();
      announce('Busted. The police took 20% of your cash.');
    } else {
      audio.wasted();
      announce('Wasted. Cash earned $' + earned + '.');
    }
  }

  function handleEvents(events) {
    if (events & EVENT_SHOT) audio.gunshot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_MISSION_DONE) {
      audio.missionDone();
      announce('Job done. Next job on the map.');
    }
    if (events & EVENT_WANTED_UP) audio.startSiren();
  }

  function step(frameActions) {
    if (screen === SCREEN_TITLE) {
      // Attract mode: traffic and pedestrians keep the city alive behind the title.
      world.step(STEP, { steer: { x: 0, y: 0 }, mouse: { down: false }, mouseWorld: null, actions: 0 });
      return;
    }
    const steer = input.steering();
    const mouse = input.mouse();
    const rect = canvas.getBoundingClientRect();
    const mouseWorld = (() => {
      const p = world.state.player;
      // Mouse in view pixels -> world: the camera centres on the player.
      const vx = (mouse.x / rect.width) * 1280 - 640;
      const vy = (mouse.y / rect.height) * 720 - 360;
      return { x: p.x + vx, y: p.y + vy };
    })();
    const events = world.step(STEP, { steer, mouse, mouseWorld, actions: frameActions });
    handleEvents(events);
    audio.engine(world.state.player.inCar ? Math.abs((world.playerCar() || { speed: 0 }).speed) / 640 : 0);
    if (world.state.wanted === 0) audio.stopSiren();
    if (world.state.over) endGame();
    else if (world.state.victory && screen === SCREEN_PLAY) {
      // Victory is shown as a game-over panel with a win message; the city keeps moving.
      endGame();
    }
  }

  function handleActions(actions) {
    if (actions & ACTION_CONFIRM && (screen === SCREEN_TITLE || screen === SCREEN_OVER)) startGame();
    else if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // Actions are taken once per frame and handed to the first simulation step, so a
    // press is never lost and never counted twice.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, save);
  }

  // Leaving the tab pauses a running game rather than letting the city run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // Mute with M; the audio module owns the flag through a key of its own.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') audio.setMuted(true);
  });

  announce('Solara Bay. Press Space or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
