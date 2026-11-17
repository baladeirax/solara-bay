// Solara Bay's simulation: the player on foot or in a car, traffic that follows the road
// grid, pedestrians on the sidewalks, police who chase the wanted level, combat, pickups,
// particles, and the five-mission story. Everything advances in fixed 1/60 s steps from the
// seeded generator, so the same seed always plays the same way.

import { CITY, STEP, PLAYER, CAR, POLICE, WANTED, TRAFFIC, PEDS, PISTOL, MISSION_PAY } from './config.js';
import { createCity, blocked, onRoad, nearestRoadPoint, PLACES } from './city.js';
import { MISSIONS, stepPlace } from './missions.js';
import { randInt, pick } from './random.js';

export const EVENT_WASTED = 1;
export const EVENT_BUSTED = 2;
export const EVENT_MISSION_DONE = 4;
export const EVENT_PICKUP = 8;
export const EVENT_SHOT = 16;
export const EVENT_CRASH = 32;
export const EVENT_PUNCH = 64;
export const EVENT_WANTED_UP = 128;

const TAU = Math.PI * 2;
const CAR_COLORS = ['#d84a4a', '#4a8ad8', '#e8e8e8', '#d8c84a', '#4ad8a0', '#b06ad8', '#e87a2a'];
const PED_COLORS = ['#e8e8e8', '#d8a0a0', '#a0c8d8', '#c8d8a0', '#d8b0e8', '#f0d0a0'];

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function dist(ax, ay, bx, by) {
  return Math.hypot(ax - bx, ay - by);
}
function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax);
}
function turnToward(angle, target, maxTurn) {
  let d = target - angle;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return angle + clamp(d, -maxTurn, maxTurn);
}

export function createWorld(random) {
  const city = createCity(random);
  const state = {
    time: 0,
    city,
    player: null,
    cars: [],
    peds: [],
    bullets: [],
    particles: [],
    pickups: [],
    police: [],
    wanted: 0,
    wantedHidden: 0,
    lastSeen: null,
    unseenFor: 0,
    cash: 0,
    earned: 0,
    mission: 0,
    stepIndex: 0,
    dialogue: '',
    dialogueUntil: 0,
    bustTimer: 0,
    shake: 0,
    pickupTimer: 18,
    nextCarId: 1,
    targetCarId: 0,
    over: false,
    overReason: '',
    victory: false,
  };

  function spawnCar(x, y, angle, kind, color) {
    const car = {
      id: state.nextCarId,
      x, y, angle, speed: 0, kind, color,
      health: 100, dir: 0, disabled: false, honk: 0,
    };
    state.nextCarId += 1;
    state.cars.push(car);
    return car;
  }

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    let x, y, dir;
    if (horizontal) {
      const ry = pick(random, city.roadsY);
      dir = random() < 0.5 ? 0 : 2;
      x = randInt(random, 100, CITY.width - 100);
      y = ry + (dir === 0 ? 24 : -24);
    } else {
      const rx = pick(random, city.roadsX);
      dir = random() < 0.5 ? 1 : 3;
      x = rx + (dir === 1 ? -24 : 24);
      y = randInt(random, 100, CITY.height - 100);
    }
    const car = spawnCar(x, y, [0, Math.PI / 2, Math.PI, -Math.PI / 2][dir], 'traffic', pick(random, CAR_COLORS));
    car.dir = dir;
    car.cruise = TRAFFIC.speed + (random() - 0.5) * TRAFFIC.speedJitter;
    car.speed = car.cruise;
    return car;
  }

  function spawnPed() {
    const rx = pick(random, city.roadsX);
    const ry = pick(random, city.roadsY);
    const ped = {
      x: rx + (random() < 0.5 ? 70 : -70),
      y: ry + (random() < 0.5 ? 70 : -70),
      angle: random() * TAU,
      speed: PEDS.speed * (0.7 + random() * 0.6),
      color: pick(random, PED_COLORS),
      panic: 0,
      down: 0,
      wander: 2 + random() * 4,
    };
    state.peds.push(ped);
    return ped;
  }

  function burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i += 1) {
      const a = random() * TAU;
      const s = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.4 + random() * 0.5, maxLife: 0.9, color, size: 2 + random() * 3,
      });
    }
    if (state.particles.length > 220) state.particles.splice(0, state.particles.length - 220);
  }

  function raiseWanted(n, reason) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    state.wantedHidden = 0;
    if (state.wanted > before) return EVENT_WANTED_UP;
    return 0;
  }

  /** Push a circle (the player on foot) out of buildings, water and the city edge, so
   * walking slides along walls instead of wedging into corners. */
  function resolveCircle(x, y, r) {
    for (const b of city.buildings) {
      const cx = clamp(x, b.x, b.x + b.w);
      const cy = clamp(y, b.y, b.y + b.h);
      const dx = x - cx;
      const dy = y - cy;
      const d2 = dx * dx + dy * dy;
      if (d2 < r * r) {
        if (d2 === 0) {
          y = b.y - r;
        } else {
          const d = Math.sqrt(d2);
          x = cx + (dx / d) * r;
          y = cy + (dy / d) * r;
        }
      }
    }
    if (y > city.waterY - r) y = city.waterY - r;
    x = clamp(x, 8 + r, CITY.width - 8 - r);
    y = clamp(y, 8 + r, CITY.height - 8 - r);
    return { x, y };
  }

  function playerCar() {
    if (!state.player.inCar) return null;
    return state.cars.find((c) => c.id === state.player.inCar) || null;
  }

  function nearestCar(x, y, maxDist, kinds) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (kinds && !kinds.includes(car.kind)) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function startMission(index) {
    const mission = MISSIONS[index];
    if (!mission) return;
    state.mission = index;
    state.stepIndex = 0;
    state.dialogue = mission.briefing;
    state.dialogueUntil = state.time + 6;
    // Mission 4 starts with the heat already on.
    if (mission.id === 4) state.wanted = 3;
    setupStep();
  }

  function setupStep() {
    const mission = MISSIONS[state.mission];
    if (!mission) return;
    const step = mission.steps[state.stepIndex];
    if (!step) return;
    if (step.type === 'stealCar') {
      const place = stepPlace(step);
      const color = mission.id === 5 ? '#8a8f96' : '#ffd23f';
      const car = spawnCar(place.x + 60, place.y + 40, 0, 'target', color);
      car.targetFor = mission.id;
      state.targetCarId = car.id;
    }
  }

  function completeStep() {
    const mission = MISSIONS[state.mission];
    state.stepIndex += 1;
    if (state.stepIndex >= mission.steps.length) {
      state.cash += mission.pay;
      state.earned += mission.pay;
      state.dialogue = mission.done;
      state.dialogueUntil = state.time + 5;
      burst(state.player.x, state.player.y, '#ffd23f', 24, 160);
      const next = state.mission + 1;
      if (next >= MISSIONS.length) {
        state.victory = true;
        state.dialogue = 'SOLARA IS YOURS! All five jobs done. Free roam — the city is yours, Dee.';
        state.dialogueUntil = state.time + 8;
        return EVENT_MISSION_DONE;
      }
      startMission(next);
      return EVENT_MISSION_DONE;
    }
    return 0;
  }

  function reset() {
    state.time = 0;
    state.cars = [];
    state.peds = [];
    state.bullets = [];
    state.particles = [];
    state.pickups = [];
    state.police = [];
    state.wanted = 0;
    state.wantedHidden = 0;
    state.cash = 0;
    state.earned = 0;
    state.mission = 0;
    state.stepIndex = 0;
    state.dialogue = '';
    state.dialogueUntil = 0;
    state.bustTimer = 0;
    state.shake = 0;
    state.pickupTimer = 18;
    state.nextCarId = 1;
    state.targetCarId = 0;
    state.over = false;
    state.overReason = '';
    state.victory = false;
    state.player = {
      x: PLACES.garage.x + 40, y: PLACES.garage.y + 80,
      angle: 0, health: PLAYER.health,
      inCar: 0, weapon: 'fists', ammo: 0,
      punchCd: 0, fireCd: 0, speed: 0, bustFlash: 0,
    };
    // The player's own car, parked on the road by the garage, facing along it so
    // it can pull away without swinging into the block behind the garage.
    const own = spawnCar(PLACES.garage.x, PLACES.garage.y + 140, Math.PI / 2, 'player', '#f2c94c');
    own.speed = 0;
    for (let i = 0; i < TRAFFIC.count; i += 1) spawnTrafficCar();
    for (const spot of city.parkedSpots) {
      spawnCar(spot.x, spot.y, spot.angle, 'parked', pick(random, CAR_COLORS));
    }
    for (let i = 0; i < PEDS.count; i += 1) spawnPed();
    startMission(0);
    state.dialogue = 'Dee: "One last job, they said. Sure."';
    state.dialogueUntil = state.time + 5;
  }

  function enterCar(car) {
    state.player.inCar = car.id;
    car.kind = 'player';
    state.player.x = car.x;
    state.player.y = car.y;
    return true;
  }

  function exitCar() {
    const car = playerCar();
    if (!car) return;
    car.kind = 'parked';
    car.speed = 0;
    const a = car.angle + Math.PI / 2;
    let x = car.x + Math.cos(a) * 40;
    let y = car.y + Math.sin(a) * 40;
    if (blocked(city, x, y)) {
      x = car.x - Math.cos(a) * 40;
      y = car.y - Math.sin(a) * 40;
    }
    state.player.x = x;
    state.player.y = y;
    state.player.inCar = 0;
  }

  function sellCarAtGarage(car) {
    if (dist(car.x, car.y, PLACES.garage.x, PLACES.garage.y) < 110 && car.kind !== 'player') {
      state.cash += 150;
      state.earned += 150;
      state.dialogue = 'Sold a hot car at the Garage: +$150.';
      state.dialogueUntil = state.time + 3;
      state.cars = state.cars.filter((c) => c.id !== car.id);
      burst(car.x, car.y, '#4ad8a0', 16, 120);
      return true;
    }
    return false;
  }

  function stepPlayer(dt, input, events) {
    const p = state.player;
    p.punchCd = Math.max(0, p.punchCd - dt);
    p.fireCd = Math.max(0, p.fireCd - dt);
    const car = playerCar();
    if (car) {
      // Driving: up accelerates, down brakes/reverses, left/right steer.
      const steer = input.steer.x;
      const throttle = input.steer.y < 0 ? 1 : 0;
      const braking = input.steer.y > 0 ? 1 : 0;
      if (throttle) car.speed += CAR.accel * dt;
      if (braking) car.speed -= (car.speed > 0 ? CAR.brake : CAR.reverseAccel) * dt;
      car.speed -= car.speed * 0.35 * dt;
      car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
      const steerAmount = CAR.steer * steer * clamp(Math.abs(car.speed) / 200, 0.25, 1) * (car.speed < 0 ? -1 : 1);
      car.angle += steerAmount * dt;
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      // Building collision: check the nose; bounce off.
      const noseX = nx + Math.cos(car.angle) * (CAR.length / 2);
      const noseY = ny + Math.sin(car.angle) * (CAR.length / 2);
      if (blocked(city, noseX, noseY) || blocked(city, nx, ny)) {
        if (Math.abs(car.speed) > 240) {
          burst(noseX, noseY, '#f2c94c', 10, 140);
          events.value |= EVENT_CRASH;
        }
        car.speed *= -0.25;
      } else {
        car.x = nx;
        car.y = ny;
      }
      p.x = car.x;
      p.y = car.y;
      p.angle = car.angle;
      p.speed = Math.abs(car.speed);
      // Handbrake / punch button while driving: a sharp skid.
      if (input.actions & 1 && Math.abs(car.speed) > 100) {
        car.speed *= 0.92;
        car.angle += steer * 0.06;
      }
      // Selling a stolen car at the garage.
      if (car.kind === 'player') sellCarAtGarage(car);
      return;
    }

    // On foot: WASD moves, the player faces the mouse.
    const s = input.steer;
    const len = Math.hypot(s.x, s.y) || 1;
    const mx = s.x / len;
    const my = s.y / len;
    const moving = s.x !== 0 || s.y !== 0;
    const speed = moving ? PLAYER.walkSpeed : 0;
    p.speed = speed;
    const np = resolveCircle(p.x + mx * speed * dt, p.y + my * speed * dt, PLAYER.radius);
    p.x = np.x;
    p.y = np.y;
    if (input.mouseWorld) p.angle = angleTo(p.x, p.y, input.mouseWorld.x, input.mouseWorld.y);
    // Punch: short range, knocks a ped down.
    if ((input.actions & 1) && p.punchCd <= 0) {
      p.punchCd = PLAYER.punchCooldown;
      const hx = p.x + Math.cos(p.angle) * PLAYER.punchRange;
      const hy = p.y + Math.sin(p.angle) * PLAYER.punchRange;
      for (const ped of state.peds) {
        if (ped.down <= 0 && dist(hx, hy, ped.x, ped.y) < 30) {
          ped.down = 3;
          ped.panic = 3;
          burst(ped.x, ped.y, '#e8e8e8', 8, 100);
          events.value |= EVENT_PUNCH;
          break;
        }
      }
    }
    // Pistol: hold the mouse to fire toward the cursor.
    if (p.weapon === 'pistol' && input.mouse && input.mouse.down && p.fireCd <= 0 && p.ammo > 0) {
      p.fireCd = PISTOL.cooldown;
      p.ammo -= 1;
      const a = p.angle;
      state.bullets.push({
        x: p.x + Math.cos(a) * 22, y: p.y + Math.sin(a) * 22,
        vx: Math.cos(a) * PISTOL.bulletSpeed, vy: Math.sin(a) * PISTOL.bulletSpeed,
        life: PISTOL.range / PISTOL.bulletSpeed,
      });
      events.value |= EVENT_SHOT;
      state.shake = Math.max(state.shake, 3);
      if (state.wanted < 1) events.value |= raiseWanted(1);
    }
  }

  function stepTraffic(dt) {
    for (const car of state.cars) {
      if (car.kind !== 'traffic' || car.disabled) continue;
      const dirVec = [[1, 0], [0, 1], [-1, 0], [0, -1]][car.dir];
      // Stop for anything right ahead (a car, or the player on foot).
      let ahead = 70;
      for (const other of state.cars) {
        if (other === car) continue;
        const dx = other.x - car.x;
        const dy = other.y - car.y;
        const along = dx * dirVec[0] + dy * dirVec[1];
        const side = Math.abs(dx * dirVec[1] - dy * dirVec[0]);
        if (along > 0 && along < 70 && side < 30) ahead = Math.min(ahead, along);
      }
      const p = state.player;
      if (!p.inCar) {
        const dx = p.x - car.x;
        const dy = p.y - car.y;
        const along = dx * dirVec[0] + dy * dirVec[1];
        const side = Math.abs(dx * dirVec[1] - dy * dirVec[0]);
        if (along > 0 && along < 70 && side < 30) ahead = 0;
      }
      const targetSpeed = ahead < 40 ? 0 : car.cruise;
      car.speed += clamp(targetSpeed - car.speed, -300 * dt, 200 * dt);
      car.x += dirVec[0] * car.speed * dt;
      car.y += dirVec[1] * car.speed * dt;
      // At an intersection, sometimes turn onto the crossing road.
      const onX = city.roadsX.some((rx) => Math.abs(car.x - rx) < 4);
      const onY = city.roadsY.some((ry) => Math.abs(car.y - ry) < 4);
      const atJunction = (car.dir % 2 === 0 && onY) || (car.dir % 2 === 1 && onX);
      if (atJunction && random() < 0.3) {
        const options = [0, 1, 2, 3].filter((d) => d !== car.dir && d !== (car.dir + 2) % 4);
        const nd = pick(random, options);
        car.dir = nd;
        if (nd === 0) car.y = nearestRoadPoint(city, car.x, car.y).y + 24;
        if (nd === 2) car.y = nearestRoadPoint(city, car.x, car.y).y - 24;
        if (nd === 1) car.x = nearestRoadPoint(city, car.x, car.y).x - 24;
        if (nd === 3) car.x = nearestRoadPoint(city, car.x, car.y).x + 24;
        car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][nd];
      }
      // Keep inside the city; loop back at the edge.
      if (car.x < 40 || car.x > CITY.width - 40 || car.y < 40 || car.y > CITY.height - 40) {
        car.x = clamp(car.x, 60, CITY.width - 60);
        car.y = clamp(car.y, 60, CITY.height - 60);
        car.dir = (car.dir + 2) % 4;
        car.angle = [0, Math.PI / 2, Math.PI, -Math.PI / 2][car.dir];
      }
    }
    // Keep traffic topped up.
    const traffic = state.cars.filter((c) => c.kind === 'traffic').length;
    if (traffic < TRAFFIC.count && random() < 0.02) spawnTrafficCar();
  }

  function stepPeds(dt) {
    for (const ped of state.peds) {
      if (ped.down > 0) {
        ped.down -= dt;
        continue;
      }
      // A fast car bearing down on a pedestrian makes them dive out of the way.
      // Without this, a car at full speed runs peds over constantly and the
      // wanted level climbs on its own during every chase. They dive sideways,
      // perpendicular to the car's line — running straight away would keep them
      // in the car's path, and the car is faster.
      if (ped.panic <= 0) {
        for (const car of state.cars) {
          if (car.disabled || Math.abs(car.speed) < 150) continue;
          const d = dist(car.x, car.y, ped.x, ped.y);
          if (d > 150) continue;
          const toward = (ped.x - car.x) * Math.cos(car.angle) + (ped.y - car.y) * Math.sin(car.angle);
          if (toward > -40) {
            const cross = Math.cos(car.angle) * (ped.y - car.y) - Math.sin(car.angle) * (ped.x - car.x);
            ped.panic = 1.5;
            ped.fleeAngle = car.angle + (cross >= 0 ? Math.PI / 2 : -Math.PI / 2);
            break;
          }
        }
      }
      if (ped.panic > 0) {
        ped.panic -= dt;
        const away = ped.fleeAngle ?? angleTo(state.player.x, state.player.y, ped.x, ped.y);
        ped.angle = away;
        const nx = ped.x + Math.cos(away) * PEDS.speed * 2.2 * dt;
        const ny = ped.y + Math.sin(away) * PEDS.speed * 2.2 * dt;
        if (!blocked(city, nx, ny)) { ped.x = nx; ped.y = ny; }
        continue;
      }
      ped.wander -= dt;
      if (ped.wander <= 0) {
        ped.wander = 2 + random() * 4;
        ped.angle = random() * TAU;
      }
      const nx = ped.x + Math.cos(ped.angle) * ped.speed * dt;
      const ny = ped.y + Math.sin(ped.angle) * ped.speed * dt;
      if (onRoad(city, nx, ny) || !blocked(city, nx, ny)) {
        ped.x = nx;
        ped.y = ny;
      } else {
        ped.angle = random() * TAU;
      }
    }
    // Player's car hitting a pedestrian.
    const car = playerCar();
    if (car && Math.abs(car.speed) > 90) {
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 34) {
          ped.down = 4;
          ped.panic = 4;
          burst(ped.x, ped.y, '#e5534b', 12, 130);
          raiseWanted(1);
          state.shake = Math.max(state.shake, 6);
        }
      }
    }
  }

  function stepPolice(dt) {
    const want = WANTED.units[state.wanted];
    // Spawn police up to the wanted level's count.
    while (state.police.length < want) {
      const a = random() * TAU;
      const x = clamp(state.player.x + Math.cos(a) * 520, 60, CITY.width - 60);
      const y = clamp(state.player.y + Math.sin(a) * 520, 60, CITY.height - 60);
      const rp = nearestRoadPoint(city, x, y);
      const car = spawnCar(rp.x, rp.y, angleTo(rp.x, rp.y, state.player.x, state.player.y), 'police', '#3a6fd8');
      car.speed = 200;
      state.police.push(car.id);
    }
    // Remove extra police when the wanted level falls.
    while (state.police.length > want) {
      const id = state.police.pop();
      const car = state.cars.find((c) => c.id === id);
      if (car) state.cars = state.cars.filter((c) => c.id !== id);
    }
    const p = state.player;
    // Line of sight: a police car sees the player when it is close and no building
    // stands between them. Break sight, stay hidden, and the heat dies down.
    let anySight = false;
    let nearest = Infinity;
    for (const id of state.police) {
      const car = state.cars.find((c) => c.id === id);
      if (!car || car.disabled) continue;
      const d = dist(car.x, car.y, p.x, p.y);
      nearest = Math.min(nearest, d);
      if (d < 600) {
        let clear = true;
        for (let s = 1; s < 8; s += 1) {
          const sx = car.x + ((p.x - car.x) * s) / 8;
          const sy = car.y + ((p.y - car.y) * s) / 8;
          if (blocked(city, sx, sy)) { clear = false; break; }
        }
        if (clear) anySight = true;
      }
    }
    if (anySight) {
      state.lastSeen = { x: p.x, y: p.y };
      state.unseenFor = 0;
      state.wantedHidden = 0;
    } else {
      state.unseenFor += dt;
      state.wantedHidden += dt;
      if (state.wanted > 0 && state.wantedHidden > WANTED.decaySeconds) {
        state.wanted -= 1;
        state.wantedHidden = 0;
      }
    }
    let copClose = false;
    for (const id of state.police) {
      const car = state.cars.find((c) => c.id === id);
      if (!car || car.disabled) continue;
      // Chase the player when seen; otherwise search the last place they were seen.
      const target = anySight ? { x: p.x, y: p.y } : state.lastSeen || { x: p.x, y: p.y };
      if (!anySight && state.unseenFor > 4 && dist(car.x, car.y, target.x, target.y) < 120) {
        const rp = nearestRoadPoint(city, target.x + (random() - 0.5) * 600, target.y + (random() - 0.5) * 600);
        car.searchTarget = rp;
      }
      const goal = car.searchTarget && !anySight ? car.searchTarget : target;
      if (car.searchTarget && anySight) car.searchTarget = null;
      const goalAngle = angleTo(car.x, car.y, goal.x, goal.y);
      car.angle = turnToward(car.angle, goalAngle, 2.4 * dt);
      car.speed = Math.min(car.speed + POLICE.accel * dt, POLICE.maxSpeed);
      const nx = car.x + Math.cos(car.angle) * car.speed * dt;
      const ny = car.y + Math.sin(car.angle) * car.speed * dt;
      if (!blocked(city, nx, ny)) {
        car.x = nx;
        car.y = ny;
      } else {
        car.angle += Math.PI / 3;
        car.speed *= 0.6;
      }
      const d = dist(car.x, car.y, p.x, p.y);
      const pcar = playerCar();
      if (!pcar && d < 70) {
        // On foot and caught: the cop stops beside you and the bust clock runs. Run
        // away and it starts over.
        copClose = true;
        car.speed = Math.max(0, car.speed - POLICE.accel * 2 * dt);
        state.bustTimer += dt;
        if (state.bustTimer > POLICE.bustSeconds) {
          state.over = true;
          state.overReason = 'busted';
          state.cash = Math.floor(state.cash * 0.8);
          state.wanted = 0;
          state.police = [];
        }
        continue;
      }
      car.ramCd = Math.max(0, (car.ramCd || 0) - dt);
      if (pcar && d < 46 && car.ramCd <= 0) {
        // Ram the player's car, then ease off: a hit every step would pin the
        // player in place and shred them in seconds. One hit per cop per second.
        // The ram hurts but doesn't cut the player's speed — otherwise the
        // player can never pull away and escape.
        car.ramCd = 1;
        car.speed = Math.min(car.speed, 60);
        p.health -= POLICE.ramDamage;
        burst(car.x, car.y, '#f2c94c', 6, 120);
        state.shake = Math.max(state.shake, 5);
      }
    }
    if (!copClose) state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
  }

  function stepBullets(dt) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (blocked(city, b.x, b.y)) {
        b.life = 0;
        burst(b.x, b.y, '#f2c94c', 4, 80);
      }
      for (const ped of state.peds) {
        if (ped.down > 0) continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 16) {
          ped.down = 5;
          ped.panic = 5;
          b.life = 0;
          burst(ped.x, ped.y, '#e5534b', 10, 120);
          state.pickups.push({ x: ped.x, y: ped.y, kind: 'cash', value: 20 });
          raiseWanted(1);
        }
      }
      for (const car of state.cars) {
        if (car.kind !== 'police' || car.disabled) continue;
        if (dist(b.x, b.y, car.x, car.y) < 30) {
          car.health -= PISTOL.damage;
          b.life = 0;
          burst(b.x, b.y, '#f2c94c', 6, 100);
          if (car.health <= 0) {
            car.disabled = true;
            car.speed = 0;
            burst(car.x, car.y, '#333', 20, 160);
            raiseWanted(1);
          }
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
  }

  function stepPickups(dt) {
    const p = state.player;
    state.pickupTimer -= dt;
    if (state.pickupTimer <= 0) {
      state.pickupTimer = 22 + random() * 10;
      if (state.pickups.length < 3) {
        const rx = pick(random, city.roadsX);
        const ry = pick(random, city.roadsY);
        state.pickups.push({
          x: rx + (random() < 0.5 ? 70 : -70),
          y: ry + (random() < 0.5 ? 70 : -70),
          kind: random() < 0.5 ? 'ammo' : 'health',
          value: 0,
        });
      }
    }
    for (const pk of state.pickups) {
      if (dist(p.x, p.y, pk.x, pk.y) < 34) {
        pk.taken = true;
        if (pk.kind === 'cash') {
          state.cash += pk.value;
          state.earned += pk.value;
        } else if (pk.kind === 'ammo') {
          p.ammo += 12;
          if (p.weapon !== 'pistol') p.weapon = 'pistol';
        } else if (pk.kind === 'health') {
          p.health = Math.min(PLAYER.health, p.health + 40);
        }
        burst(pk.x, pk.y, '#4ad8a0', 10, 110);
      }
    }
    state.pickups = state.pickups.filter((pk) => !pk.taken);
  }

  function stepMissions(dt) {
    const mission = MISSIONS[state.mission];
    if (!mission) return 0;
    const step = mission.steps[state.stepIndex];
    if (!step) return 0;
    const p = state.player;
    const place = stepPlace(step);
    let done = false;
    if (step.type === 'goto') {
      done = dist(p.x, p.y, place.x, place.y) < 80;
    } else if (step.type === 'driveTo') {
      const car = playerCar();
      done = !!car && dist(car.x, car.y, place.x, place.y) < 90;
    } else if (step.type === 'stealCar') {
      const car = playerCar();
      done = !!car && car.id === state.targetCarId;
    } else if (step.type === 'escape') {
      done = state.wanted === 0;
    }
    if (done) return completeStep();
    return 0;
  }

  function step(dt, input) {
    const events = { value: 0 };
    if (state.over) return events.value;
    state.time += dt;
    state.shake = Math.max(0, state.shake - dt * 14);
    if (state.dialogue && state.time > state.dialogueUntil) state.dialogue = '';

    // Enter / exit a car.
    if (input.actions & 4) {
      const p = state.player;
      if (p.inCar) {
        exitCar();
      } else {
        const car = nearestCar(p.x, p.y, 70, ['parked', 'traffic', 'target', 'player']);
        if (car) {
          const wasTarget = car.kind === 'target';
          enterCar(car);
          if (car.kind === 'player' && !wasTarget) {
            // Stealing a stranger's car is a crime; your own car is not.
            if (car.id !== 1) events.value |= raiseWanted(1);
          }
          if (wasTarget) {
            // Stepping into the mission's target car counts as the steal — and
            // stealing a car in broad daylight draws the law.
            events.value |= raiseWanted(1);
          }
        }
      }
    }
    // Switch weapon with Q.
    if (input.actions & 16) {
      state.player.weapon = state.player.weapon === 'fists' && state.player.ammo > 0 ? 'pistol' : 'fists';
    }

    stepPlayer(dt, input, events);
    stepTraffic(dt);
    stepPeds(dt);
    stepPolice(dt);
    stepBullets(dt);
    stepPickups(dt);
    events.value |= stepMissions(dt);

    // Car-on-car bumps between the player and traffic: separate the two cars by
    // the overlap so they don't stick together (a velocity shove launched the
    // player car across the map and wedged it against the city edge). Traffic
    // gives way to the player: the traffic car takes the whole shove, so the
    // player's car keeps its line instead of being pushed off the road.
    const pcar = playerCar();
    if (pcar) {
      for (const car of state.cars) {
        if (car === pcar || car.disabled) continue;
        // Police overlap is handled by the ram in stepPolice, not here: the
        // police car keeps driving into the player, and separating them every
        // step acted like a 360 px/s shove that launched the player off the road.
        if (car.kind === 'police') continue;
        const d = dist(pcar.x, pcar.y, car.x, car.y);
        if (d < 44) {
          const overlap = 44 - d;
          const a = angleTo(car.x, car.y, pcar.x, pcar.y);
          if (car.kind === 'traffic') {
            car.x -= Math.cos(a) * overlap;
            car.y -= Math.sin(a) * overlap;
            car.speed *= 0.9;
          } else {
            pcar.x += Math.cos(a) * overlap * 0.5;
            pcar.y += Math.sin(a) * overlap * 0.5;
            car.x -= Math.cos(a) * overlap * 0.5;
            car.y -= Math.sin(a) * overlap * 0.5;
          }
          if (Math.abs(pcar.speed) > 200) {
            events.value |= EVENT_CRASH;
            state.shake = Math.max(state.shake, 4);
          }
        }
      }
    }

    // Health / wasted.
    if (state.player.health <= 0 && !state.over) {
      state.over = true;
      state.overReason = 'wasted';
      state.wanted = 0;
    }
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.92;
      pt.vy *= 0.92;
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);
    return events.value;
  }

  reset();

  return {
    state,
    reset,
    step,
    playerCar,
    /** Start (or restart) a story mission, for screenshot staging. */
    startMission,
    /** Put the player in their own car, for screenshot staging. */
    putPlayerInCar() {
      const car = state.cars.find((c) => c.id === 1);
      if (car && !state.player.inCar) enterCar(car);
    },
    /** Set the wanted level directly, for screenshot staging. */
    setWanted(n) {
      state.wanted = n;
      state.wantedHidden = 0;
    },
    /** The world position the camera should centre on. */
    focus() {
      return { x: state.player.x, y: state.player.y };
    },
  };
}
