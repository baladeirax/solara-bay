// The screenshot scenes behind ?shot=start|chase|mission|drive. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by simple
// autopilots, so the frame is what a short game really looks like and the same seed
// always gives the same frame.

import { STEP } from './config.js';
import { PLACES } from './city.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const CHASE_SECONDS = 18;
const MISSION_SECONDS = 9;
const DRIVE_SECONDS = 16;

/** Plan a path along the road grid: horizontally to the nearest vertical road, along it
 * to the target's horizontal road, then along that road to the target. Both the driving
 * and the walking autopilots follow it, so neither wedges against a building face. */
function planRoadPath(city, from, to) {
  const rx = city.roadsX.reduce((a, b) => (Math.abs(b - from.x) < Math.abs(a - from.x) ? b : a));
  const tx = city.roadsX.reduce((a, b) => (Math.abs(b - to.x) < Math.abs(a - to.x) ? b : a));
  const ty = city.roadsY.reduce((a, b) => (Math.abs(b - to.y) < Math.abs(a - to.y) ? b : a));
  return [
    { x: rx, y: from.y },
    { x: rx, y: ty },
    { x: tx, y: ty },
    { x: to.x, y: to.y },
  ];
}

let walkPath = null;
let walkTarget = null;
let drivePath = null;
let driveTarget = null;
// Stuck detection for the driving autopilot: when the car is wedged against a
// building it stops moving even though the waypoint is far away. Track its
// position; if it barely moves for half a second, reverse for a second to back
// out of the wedge.
let driveLastX = 0;
let driveLastY = 0;
let driveStuckSteps = 0;
let driveReverseSteps = 0;

/** A walking autopilot that follows the road path to its target. */
export function walkInput(world, target) {
  const p = world.state.player;
  if (!walkPath || walkTarget !== target) {
    walkPath = planRoadPath(world.state.city, p, target);
    walkTarget = target;
  }
  while (walkPath.length > 0 && Math.hypot(p.x - walkPath[0].x, p.y - walkPath[0].y) < 24) walkPath.shift();
  const wp = walkPath.length > 0 ? walkPath[0] : target;
  const dx = wp.x - p.x;
  const dy = wp.y - p.y;
  return {
    steer: { x: Math.abs(dx) > 12 ? Math.sign(dx) : 0, y: Math.abs(dy) > 12 ? Math.sign(dy) : 0 },
    mouse: { down: false },
    mouseWorld: { x: wp.x, y: wp.y },
    actions: 0,
  };
}

/** A driving autopilot that follows the road path to its target. It brakes while turning
 * hard, so the car follows the roads instead of cutting corners across the blocks. */
export function driveInput(world, target) {
  const car = world.playerCar();
  if (!car) return { steer: { x: 0, y: 0 }, mouse: { down: false }, mouseWorld: null, actions: 0 };
  if (!drivePath || driveTarget !== target) {
    drivePath = planRoadPath(world.state.city, car, target);
    driveTarget = target;
  }
  // Advance past a waypoint once the car reaches it, or once it has driven past
  // it. The radius is small on purpose: a wide radius skips the short corner legs
  // of the path and sends the car straight across a block, into a building.
  while (drivePath.length > 0) {
    const w0 = drivePath[0];
    const dd = Math.hypot(car.x - w0.x, car.y - w0.y);
    // The waypoint is behind the car when the dot product of heading and the
    // direction to it is clearly negative (the -5 ignores float noise: at
    // exactly 90 degrees the dot is ~1e-15, not zero).
    const behind = (w0.x - car.x) * Math.cos(car.angle) + (w0.y - car.y) * Math.sin(car.angle) < -5;
    if (dd < 36 || (behind && dd < 150)) drivePath.shift();
    else break;
  }
  const wp = drivePath.length > 0 ? drivePath[0] : target;
  const wpDist = Math.hypot(car.x - wp.x, car.y - wp.y);
  // Stuck detection: every 30 steps, check whether the car moved at least 30 px
  // in that window (60 px/s). If not, while the waypoint is still far away, it
  // is wedged — back straight out for a second.
  driveStuckSteps += 1;
  if (driveStuckSteps >= 30) {
    if (Math.hypot(car.x - driveLastX, car.y - driveLastY) < 30 && wpDist > 100) {
      driveReverseSteps = 60;
    }
    driveLastX = car.x;
    driveLastY = car.y;
    driveStuckSteps = 0;
  }
  if (driveReverseSteps > 0) {
    driveReverseSteps -= 1;
    return {
      steer: { x: 0, y: 1 },
      mouse: { down: false },
      mouseWorld: null,
      actions: 0,
    };
  }
  const desired = Math.atan2(wp.y - car.y, wp.x - car.x);
  let d = desired - car.angle;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  // The target is mostly behind the car and the car is slow: back up toward it
  // instead of swinging a wide arc across a block. Steering is inverted while
  // reversing, so the steer sign flips here.
  if (Math.abs(d) > 2.4 && car.speed < 120) {
    return {
      steer: { x: d > 0 ? -1 : 1, y: 1 },
      mouse: { down: false },
      mouseWorld: null,
      actions: 0,
    };
  }
  // Brake while turning hard, but only once moving: reversing from a standstill
  // flips the steering and traps the car driving backwards. Also slow down for
  // the corner ahead: at full speed the turning circle is ~250 px, far too wide
  // for a 90-degree turn on a 96 px road.
  const turningHard = Math.abs(d) > 0.55;
  const braking = (turningHard && car.speed > 150) || (wpDist < 300 && car.speed > 220);
  return {
    steer: { x: d > 0.03 ? 1 : d < -0.03 ? -1 : 0, y: braking ? 1 : -1 },
    mouse: { down: false },
    mouseWorld: null,
    actions: 0,
  };
}

/** The loop the driving scenes cruise around the central blocks. */
const LOOP_STOPS = [
  { x: 1200, y: 800 },
  { x: 2000, y: 800 },
  { x: 2000, y: 1600 },
  { x: 1200, y: 1600 },
];

/**
 * Set `world` to the named scene and return the screen to draw over it and the save to
 * show (best score and missions done).
 */
export function stageShot(name, world) {
  const save = { best: 0, missions: 0 };
  world.reset();
  if (name === 'start') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) {
      world.step(STEP, { steer: { x: 0, y: 0 }, mouse: { down: false }, mouseWorld: null, actions: 0 });
    }
    return { screen: SCREEN_TITLE, save };
  }
  if (name === 'chase') {
    world.putPlayerInCar();
    world.setWanted(3);
    let wp = 0;
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      const car = world.playerCar();
      const stop = LOOP_STOPS[wp % LOOP_STOPS.length];
      if (car && Math.hypot(car.x - stop.x, car.y - stop.y) < 130) wp += 1;
      world.step(STEP, driveInput(world, LOOP_STOPS[wp % LOOP_STOPS.length]));
      if (world.state.over) break;
    }
    return { screen: SCREEN_PLAY, save };
  }
  if (name === 'mission') {
    world.startMission(1);
    const plaza = PLACES.plaza;
    for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
      world.step(STEP, walkInput(world, plaza));
      if (world.state.over) break;
    }
    return { screen: SCREEN_PLAY, save };
  }
  // 'drive': a calm cruise in the player's car through the city. Any heat the cruise
  // picks up by accident (a clipped pedestrian) is cleared: this scene is a calm drive.
  world.putPlayerInCar();
  let wp = 0;
  for (let i = 0; i < DRIVE_SECONDS / STEP; i += 1) {
    const car = world.playerCar();
    const stop = LOOP_STOPS[wp % LOOP_STOPS.length];
    if (car && Math.hypot(car.x - stop.x, car.y - stop.y) < 130) wp += 1;
    world.step(STEP, driveInput(world, LOOP_STOPS[wp % LOOP_STOPS.length]));
    world.state.wanted = 0;
    if (world.state.over) break;
  }
  return { screen: SCREEN_PLAY, save };
}
