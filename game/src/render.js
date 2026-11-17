// Everything on screen: the city (roads, beach, buildings, parks), the cars, the player,
// the pedestrians, particles and pickups, and the HUD — wanted stars, cash, health, the
// minimap, the mission objective and the story dialogue. Screens: title, play, paused,
// busted, wasted, and victory.

import { CITY, VIEW, PALETTE, FONT, CAR } from './config.js';
import { MISSIONS, stepPlace, stepText } from './missions.js';
import { DISTRICTS, PLACES } from './city.js';

export const SCREEN_TITLE = 0;
export const SCREEN_PLAY = 1;
export const SCREEN_PAUSED = 2;
export const SCREEN_OVER = 3;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;

  function resize() {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    scale = Math.min(canvas.width / VIEW.width, canvas.height / VIEW.height);
    offsetX = (canvas.width - VIEW.width * scale) / 2;
    offsetY = (canvas.height - VIEW.height * scale) / 2;
  }
  resize();
  window.addEventListener('resize', resize);

  /** Canvas pixel of a world point, for mouse aiming. */
  function worldToScreen(x, y, cam) {
    return {
      x: offsetX + (x - cam.x) * scale + VIEW.width * scale / 2,
      y: offsetY + (y - cam.y) * scale + VIEW.height * scale / 2,
    };
  }

  function drawCarShape(x, y, angle, color, isPolice, isTarget) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-CAR.length / 2 + 3, -CAR.width / 2 + 3, CAR.length, CAR.width);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 7);
    ctx.fill();
    ctx.fillStyle = 'rgba(20,24,32,0.85)';
    ctx.beginPath();
    ctx.roundRect(-8, -CAR.width / 2 + 4, 18, CAR.width - 8, 4);
    ctx.fill();
    ctx.fillStyle = '#cfe8ff';
    ctx.fillRect(CAR.length / 2 - 4, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(CAR.length / 2 - 4, CAR.width / 2 - 8, 3, 5);
    ctx.fillStyle = '#e5534b';
    ctx.fillRect(-CAR.length / 2 + 1, -CAR.width / 2 + 3, 3, 5);
    ctx.fillRect(-CAR.length / 2 + 1, CAR.width / 2 - 8, 3, 5);
    if (isPolice) {
      ctx.fillStyle = '#fff';
      ctx.fillRect(-6, -CAR.width / 2 + 2, 12, 5);
      ctx.fillStyle = '#111';
      ctx.font = 'bold 9px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('PD', 0, 2);
    }
    if (isTarget) {
      ctx.strokeStyle = '#ffd23f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(-CAR.length / 2 - 4, -CAR.width / 2 - 4, CAR.length + 8, CAR.width + 8, 9);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCity(city, cam) {
    const x0 = cam.x - VIEW.width / 2 - 60;
    const y0 = cam.y - VIEW.height / 2 - 60;
    const x1 = cam.x + VIEW.width / 2 + 60;
    const y1 = cam.y + VIEW.height / 2 + 60;
    // Ground.
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    // Beach and water along the south edge.
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(x0, city.beachY, x1 - x0, city.waterY - city.beachY);
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(x0, city.waterY, x1 - x0, y1 - city.waterY);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x0, city.waterY, x1 - x0, 4);
    // Parks.
    ctx.fillStyle = PALETTE.park;
    for (const p of city.parks) {
      if (p.x > x1 || p.x + p.w < x0 || p.y > y1 || p.y + p.h < y0) continue;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#2a7a3a';
      ctx.beginPath();
      ctx.arc(p.x + p.w * 0.3, p.y + p.h * 0.4, 12, 0, TAU);
      ctx.arc(p.x + p.w * 0.7, p.y + p.h * 0.6, 15, 0, TAU);
      ctx.fill();
      ctx.fillStyle = PALETTE.park;
    }
    // Parking lots.
    ctx.fillStyle = '#6a6f76';
    for (const l of city.lots) {
      if (l.x > x1 || l.x + l.w < x0 || l.y > y1 || l.y + l.h < y0) continue;
      ctx.fillRect(l.x, l.y, l.w, l.h);
    }
    // Roads.
    ctx.fillStyle = PALETTE.road;
    for (const rx of city.roadsX) ctx.fillRect(rx - CITY.roadWidth / 2, y0, CITY.roadWidth, y1 - y0);
    for (const ry of city.roadsY) ctx.fillRect(x0, ry - CITY.roadWidth / 2, x1 - x0, CITY.roadWidth);
    // Centre dashes.
    ctx.fillStyle = PALETTE.roadLine;
    for (const rx of city.roadsX) {
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) ctx.fillRect(rx - 2, y, 4, 22);
    }
    for (const ry of city.roadsY) {
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) ctx.fillRect(x, ry - 2, 22, 4);
    }
    // Buildings with a roof line and a height shadow.
    for (const b of city.buildings) {
      if (b.x > x1 || b.x + b.w < x0 || b.y > y1 || b.y + b.h < y0) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.fillRect(b.x + 5 + b.height * 2, b.y + 5 + b.height * 2, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = PALETTE.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      for (let wx = b.x + 16; wx < b.x + b.w - 10; wx += 26) {
        for (let wy = b.y + 16; wy < b.y + b.h - 10; wy += 26) ctx.fillRect(wx, wy, 10, 12);
      }
    }
    // District labels.
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.font = 'bold 20px ' + FONT;
    ctx.textAlign = 'center';
    for (const d of DISTRICTS) {
      if (d.x < x0 || d.x > x1 || d.y < y0 || d.y > y1) continue;
      ctx.fillText(d.name.toUpperCase(), d.x, d.y);
    }
  }

  function drawMinimap(state, cam) {
    const mw = 220;
    const mh = 165;
    const mx = VIEW.width - mw - 14;
    const my = 14;
    const sx = mw / CITY.width;
    const sy = mh / CITY.height;
    ctx.save();
    ctx.fillStyle = 'rgba(10,14,20,0.82)';
    ctx.beginPath();
    ctx.roundRect(mx - 6, my - 6, mw + 12, mh + 12, 10);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.beginPath();
    ctx.rect(mx, my, mw, mh);
    ctx.clip();
    ctx.fillStyle = '#2f6b3c';
    ctx.fillRect(mx, my, mw, mh);
    ctx.fillStyle = '#2a6a9a';
    ctx.fillRect(mx, my + (state.city.waterY - 40) * sy, mw, mh);
    ctx.fillStyle = '#33373f';
    for (const rx of state.city.roadsX) ctx.fillRect(mx + rx * sx - 1, my, 2, mh);
    for (const ry of state.city.roadsY) ctx.fillRect(mx, my + ry * sy - 1, mw, 2);
    // Mission marker.
    const mission = MISSIONS[state.mission];
    if (mission) {
      const step = mission.steps[state.stepIndex];
      const place = step ? stepPlace(step) : null;
      if (place) {
        const bx = mx + place.x * sx;
        const by = my + place.y * sy;
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(bx, by, 5, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
    // Police blips.
    ctx.fillStyle = '#6aa0ff';
    for (const id of state.police) {
      const car = state.cars.find((c) => c.id === id);
      if (!car) continue;
      ctx.beginPath();
      ctx.arc(mx + car.x * sx, my + car.y * sy, 3, 0, TAU);
      ctx.fill();
    }
    // Player arrow.
    const px = mx + state.player.x * sx;
    const py = my + state.player.y * sy;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(state.player.angle);
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.moveTo(8, 0);
    ctx.lineTo(-5, -5);
    ctx.lineTo(-5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.restore();
    // View rectangle.
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      mx + (cam.x - VIEW.width / 2) * sx,
      my + (cam.y - VIEW.height / 2) * sy,
      VIEW.width * sx,
      VIEW.height * sy,
    );
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = 'bold 11px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('SOLARA BAY', mx, my + mh + 20);
  }

  function drawHud(state) {
    const p = state.player;
    // Top-left: cash, health, weapon.
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    ctx.beginPath();
    ctx.roundRect(14, 14, 250, 86, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.accent;
    ctx.font = 'bold 26px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('$' + state.cash.toLocaleString('en-US'), 28, 46);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '15px ' + FONT;
    ctx.fillText('Earned $' + state.earned.toLocaleString('en-US'), 28, 70);
    // Health bar.
    ctx.fillStyle = '#333';
    ctx.fillRect(28, 78, 150, 10);
    ctx.fillStyle = p.health > 40 ? '#4ad84a' : '#e5534b';
    ctx.fillRect(28, 78, 150 * clamp(p.health / 100, 0, 1), 10);
    ctx.fillStyle = '#e8e8e8';
    ctx.font = '13px ' + FONT;
    ctx.fillText(p.inCar ? 'DRIVING' : p.weapon === 'pistol' ? `PISTOL ${p.ammo}` : 'FISTS', 188, 88);
    // Wanted stars, top centre.
    const stars = state.wanted;
    ctx.font = '30px ' + FONT;
    ctx.textAlign = 'center';
    for (let i = 0; i < 5; i += 1) {
      ctx.fillStyle = i < stars ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.fillText('★', VIEW.width / 2 - 60 + i * 30, 46);
    }
    if (state.bustTimer > 0.2 && !p.inCar && state.wanted > 0) {
      ctx.fillStyle = '#e5534b';
      ctx.font = 'bold 18px ' + FONT;
      ctx.fillText('THE COPS ARE ON YOU — RUN!', VIEW.width / 2, 72);
    }
    // Mission objective, below the stars.
    const objective = stepText(state.mission, state.stepIndex);
    ctx.fillStyle = 'rgba(10,14,20,0.78)';
    const ow = Math.min(560, 40 + objective.length * 8.5);
    ctx.beginPath();
    ctx.roundRect(VIEW.width / 2 - ow / 2, 78, ow, 34, 8);
    ctx.fill();
    ctx.fillStyle = '#ffd23f';
    ctx.font = 'bold 15px ' + FONT;
    ctx.fillText('◆ ' + objective, VIEW.width / 2, 100);
    // Dialogue, bottom centre.
    if (state.dialogue) {
      ctx.fillStyle = 'rgba(10,14,20,0.85)';
      const dw = Math.min(860, 60 + state.dialogue.length * 7.2);
      ctx.beginPath();
      ctx.roundRect(VIEW.width / 2 - dw / 2, VIEW.height - 84, dw, 52, 10);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '16px ' + FONT;
      ctx.fillText(state.dialogue, VIEW.width / 2, VIEW.height - 52);
    }
    // Controls hint, bottom left.
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText('WASD move / drive · E enter car · Space punch · Click shoot · Q weapon · P pause', 16, VIEW.height - 14);
    drawMinimap(state, { x: p.x, y: p.y });
  }

  function drawPanel(title, lines, accent) {
    ctx.fillStyle = 'rgba(8,10,16,0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = 'rgba(16,20,28,0.96)';
    ctx.beginPath();
    ctx.roundRect(VIEW.width / 2 - 330, VIEW.height / 2 - 190, 660, 380, 16);
    ctx.fill();
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.fillStyle = accent;
    ctx.font = 'bold 44px ' + FONT;
    ctx.fillText(title, VIEW.width / 2, VIEW.height / 2 - 110);
    ctx.fillStyle = '#eef1f5';
    ctx.font = '18px ' + FONT;
    lines.forEach((line, i) => {
      ctx.fillText(line, VIEW.width / 2, VIEW.height / 2 - 56 + i * 30);
    });
  }

  return {
    resize,
    worldToScreen,
    draw(state, screen, save) {
      const p = state.player;
      const cam = {
        x: clamp(p.x, VIEW.width / 2 - 40, CITY.width - VIEW.width / 2 + 40),
        y: clamp(p.y, VIEW.height / 2 - 40, CITY.height - VIEW.height / 2 + 40),
      };
      // Shake offsets are a function of the world clock, not Math.random, so a staged
      // screenshot scene is byte-identical every time it is captured.
      const shakeX = state.shake > 0 ? Math.sin(state.time * 47.3) * state.shake : 0;
      const shakeY = state.shake > 0 ? Math.cos(state.time * 39.7) * state.shake : 0;
      ctx.setTransform(scale, 0, 0, scale, offsetX - (cam.x - VIEW.width / 2) * scale + shakeX * scale, offsetY - (cam.y - VIEW.height / 2) * scale + shakeY * scale);
      drawCity(state.city, cam);
      // Mission marker beacon.
      const mission = MISSIONS[state.mission];
      if (mission && screen === SCREEN_PLAY) {
        const step = mission.steps[state.stepIndex];
        const place = step ? stepPlace(step) : null;
        if (place) {
          const pulse = 18 + Math.sin(state.time * 4) * 5;
          ctx.strokeStyle = '#ffd23f';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(place.x, place.y, pulse, 0, TAU);
          ctx.stroke();
          ctx.fillStyle = '#ffd23f';
          ctx.beginPath();
          ctx.moveTo(place.x, place.y - 26);
          ctx.lineTo(place.x - 10, place.y - 44);
          ctx.lineTo(place.x + 10, place.y - 44);
          ctx.closePath();
          ctx.fill();
        }
      }
      // Pickups.
      for (const pk of state.pickups) {
        const bob = Math.sin(state.time * 5 + pk.x) * 3;
        ctx.fillStyle = pk.kind === 'ammo' ? '#ffd23f' : pk.kind === 'health' ? '#4ad84a' : '#4ad8a0';
        ctx.beginPath();
        ctx.arc(pk.x, pk.y + bob, 10, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.font = 'bold 12px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText(pk.kind === 'ammo' ? 'A' : pk.kind === 'health' ? '+' : '$', pk.x, pk.y + bob + 4);
      }
      // Cars (police last so they draw on top).
      const sorted = [...state.cars].sort((a, b) => (a.kind === 'police' ? 1 : 0) - (b.kind === 'police' ? 1 : 0));
      for (const car of sorted) {
        if (car.disabled) {
          ctx.save();
          ctx.globalAlpha = 0.75;
          drawCarShape(car.x, car.y, car.angle, '#3a3f46', false, false);
          ctx.restore();
          continue;
        }
        drawCarShape(car.x, car.y, car.angle, car.color, car.kind === 'police', car.id === state.targetCarId);
        if (car.kind === 'police') {
          const flash = Math.floor(state.time * 6) % 2 === 0 ? '#ff3b30' : '#3b82ff';
          ctx.fillStyle = flash;
          ctx.beginPath();
          ctx.arc(car.x - Math.cos(car.angle) * 14, car.y - Math.sin(car.angle) * 14, 5, 0, TAU);
          ctx.fill();
        }
      }
      // Pedestrians.
      for (const ped of state.peds) {
        ctx.save();
        ctx.translate(ped.x, ped.y);
        if (ped.down > 0) {
          ctx.rotate(Math.PI / 2);
          ctx.globalAlpha = 0.7;
        } else {
          ctx.rotate(ped.angle);
        }
        ctx.fillStyle = ped.color;
        ctx.beginPath();
        ctx.arc(0, 0, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(5, -3, 2, 0, TAU);
        ctx.arc(5, 3, 2, 0, TAU);
        ctx.fill();
        ctx.restore();
      }
      // Bullets.
      ctx.fillStyle = '#ffe27a';
      for (const b of state.bullets) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, 3, 0, TAU);
        ctx.fill();
      }
      // Particles.
      for (const pt of state.particles) {
        ctx.globalAlpha = clamp(pt.life / pt.maxLife, 0, 1);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // The player, on foot.
      if (!p.inCar) {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.angle);
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(0, 0, 15, 0, TAU);
        ctx.fill();
        ctx.fillStyle = PALETTE.player;
        ctx.beginPath();
        ctx.arc(0, 0, 13, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(7, -4, 2.5, 0, TAU);
        ctx.arc(7, 4, 2.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#f2c94c';
        ctx.fillRect(10, -3, 12, 6);
        ctx.restore();
        // Aim line when armed.
        if (p.weapon === 'pistol') {
          ctx.strokeStyle = 'rgba(255,255,255,0.35)';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(p.angle) * 60, p.y + Math.sin(p.angle) * 60);
          ctx.stroke();
        }
      }
      // HUD and screens, in screen space.
      ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
      if (screen === SCREEN_PLAY) drawHud(state);
      if (screen === SCREEN_TITLE) {
        ctx.fillStyle = 'rgba(8,10,16,0.55)';
        ctx.fillRect(0, 0, VIEW.width, VIEW.height);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#ffd23f';
        ctx.font = 'bold 84px ' + FONT;
        ctx.fillText('SOLARA BAY', VIEW.width / 2, 240);
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 24px ' + FONT;
        ctx.fillText('An open-world crime story in the sun', VIEW.width / 2, 290);
        ctx.fillStyle = '#d8d8d8';
        ctx.font = '18px ' + FONT;
        ctx.fillText('Steal cars. Outrun the law. Run five jobs for the Harbor Crew.', VIEW.width / 2, 330);
        ctx.fillText('WASD to move and drive · E to enter a car · Space to punch · Click to shoot', VIEW.width / 2, 362);
        ctx.fillStyle = '#ffd23f';
        ctx.font = 'bold 22px ' + FONT;
        ctx.fillText('Press SPACE or click to start', VIEW.width / 2, 430);
        ctx.fillStyle = '#9aa3b0';
        ctx.font = '15px ' + FONT;
        ctx.fillText('Best score: $' + (save.best || 0).toLocaleString('en-US') + '  ·  Missions done: ' + (save.missions || 0) + '/5', VIEW.width / 2, 470);
      }
      if (screen === SCREEN_PAUSED) {
        drawPanel('PAUSED', ['The city waits for no one.', 'Press P or Space to keep playing.'], '#ffd23f');
      }
      if (screen === SCREEN_OVER) {
        if (state.overReason === 'busted') {
          drawPanel('BUSTED', ['The Solara Bay PD caught up with you.', 'They took 20% of your cash. The Crew is not impressed.', 'Press SPACE to get back out there.'], '#6aa0ff');
        } else if (state.victory) {
          drawPanel('SOLARA IS YOURS', ['All five jobs done. The Harbor Crew runs the Bay.', 'Cash earned: $' + state.earned.toLocaleString('en-US'), 'Press SPACE to keep roaming free.'], '#ffd23f');
        } else {
          drawPanel('WASTED', ['Dee Marlowe got herself wasted.', 'Cash earned: $' + state.earned.toLocaleString('en-US'), 'Press SPACE to try again.'], '#e5534b');
        }
      }
    },
  };
}
