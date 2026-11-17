// Solara Bay — every tuning number and colour in one place.
// The camera shows a 1280x720 logical window of a much larger city; nothing in the
// simulation depends on the browser window's size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city is this big, in world pixels. Roads run on a grid through it. */
export const CITY = { width: 3200, height: 2400, roadEvery: 400, roadWidth: 96 };

export const PLAYER = {
  walkSpeed: 230,
  radius: 14,
  health: 100,
  punchDamage: 25,
  punchRange: 34,
  punchCooldown: 0.35,
};

export const CAR = {
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 640,
  maxReverse: 220,
  steer: 2.6,
  grip: 0.94,
  length: 54,
  width: 26,
};

export const POLICE = {
  accel: 460,
  maxSpeed: 600,
  ramDamage: 5,
  bustSeconds: 1.2,
};

export const WANTED = {
  max: 5,
  decaySeconds: 10, // Seconds hidden from every police car to lose one star.
  // How many police units hunt the player at each wanted level.
  units: [0, 1, 2, 3, 4, 6],
};

export const TRAFFIC = { count: 14, speed: 150, speedJitter: 60 };
export const PEDS = { count: 22, speed: 55 };

export const PISTOL = { damage: 34, ammo: 12, cooldown: 0.28, range: 420, bulletSpeed: 900 };

/** Mission rewards, in dollars, in story order. */
export const MISSION_PAY = [250, 400, 600, 900, 1500];

export const PALETTE = {
  sky: '#1a2233',
  grass: '#3f7a4a',
  park: '#2f6b3c',
  sidewalk: '#9aa0a8',
  road: '#33373f',
  roadLine: '#e8c84a',
  buildingA: '#7a6a8a',
  buildingB: '#8a7a5a',
  buildingC: '#5a7a8a',
  buildingD: '#9a5a5a',
  roof: '#4a4450',
  water: '#2a6a9a',
  sand: '#d9c48a',
  player: '#f2c94c',
  police: '#3a6fd8',
  traffic: '#c8c8c8',
  ped: '#e8e8e8',
  hud: '#10141c',
  hudText: '#f2f2e8',
  accent: '#f2c94c',
  danger: '#e5534b',
  mission: '#ffd23f',
  text: '#eef1f5',
  muted: '#9aa3b0',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (cash, missions done, best score) is kept between visits. */
export const SAVE_KEY = 'solara-bay.save';
export const BEST_KEY = 'solara-bay.best';
