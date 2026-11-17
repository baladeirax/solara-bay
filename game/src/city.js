// The city of Solara Bay, generated once from a seed: a road grid, blocks filled with
// buildings, parks and parking lots, a beach along the south edge and a marina in the east.
// Everything the world and the renderer need is here: where roads run, what blocks contain,
// and the named places missions point at.

import { CITY, PALETTE } from './config.js';
import { randInt, pick } from './random.js';

export const DISTRICTS = [
  { name: 'Old Town', x: 200, y: 200 },
  { name: 'Marina', x: 2900, y: 600 },
  { name: 'The Strip', x: 1600, y: 1200 },
  { name: 'Docks', x: 2800, y: 2000 },
  { name: 'Palm Heights', x: 600, y: 1900 },
  { name: 'Solara Beach', x: 1600, y: 2250 },
];

/** Named places missions and the minimap point at. Every point sits on a road or on the
 * open beach, so the player can always reach it on foot or by car. */
export const PLACES = {
  garage: { name: "Dee's Garage", x: 800, y: 620 },
  marina: { name: 'Marina', x: 2800, y: 620 },
  casino: { name: 'Casino Solara', x: 1600, y: 1200 },
  docks: { name: 'Docks', x: 2800, y: 2000 },
  safehouse: { name: 'Safehouse', x: 800, y: 2000 },
  beach: { name: 'Solara Beach', x: 1600, y: 2240 },
  plaza: { name: 'Old Town Plaza', x: 400, y: 400 },
  hideout: { name: 'Crew Hideout', x: 1200, y: 2000 },
};

export function createCity(random) {
  const roadsX = [];
  const roadsY = [];
  for (let x = CITY.roadEvery; x < CITY.width; x += CITY.roadEvery) roadsX.push(x);
  for (let y = CITY.roadEvery; y < CITY.height; y += CITY.roadEvery) roadsY.push(y);

  const buildings = [];
  const parks = [];
  const lots = [];
  const buildingColors = [PALETTE.buildingA, PALETTE.buildingB, PALETTE.buildingC, PALETTE.buildingD];

  // Each block between four roads gets a building, a park, or a parking lot.
  for (let bx = 0; bx < roadsX.length - 0; bx += 1) {
    for (let by = 0; by < roadsY.length; by += 1) {
      const x0 = (bx === 0 ? 0 : roadsX[bx - 1]) + CITY.roadWidth / 2 + 12;
      const y0 = (by === 0 ? 0 : roadsY[by - 1]) + CITY.roadWidth / 2 + 12;
      const x1 = (bx < roadsX.length ? roadsX[bx] : CITY.width) - CITY.roadWidth / 2 - 12;
      const y1 = (by < roadsY.length ? roadsY[by] : CITY.height) - CITY.roadWidth / 2 - 12;
      if (x1 - x0 < 80 || y1 - y0 < 80) continue;
      // The south strip is beach, not blocks.
      if (y0 > CITY.height - 320) continue;
      const roll = random();
      if (roll < 0.14) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      } else if (roll < 0.26) {
        lots.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      } else {
        const bw = Math.min(x1 - x0, randInt(random, 120, 220));
        const bh = Math.min(y1 - y0, randInt(random, 100, 200));
        const bx0 = x0 + Math.floor((x1 - x0 - bw) / 2);
        const by0 = y0 + Math.floor((y1 - y0 - bh) / 2);
        buildings.push({
          x: bx0, y: by0, w: bw, h: bh,
          color: pick(random, buildingColors),
          height: randInt(random, 1, 4),
        });
        // A second smaller building in big blocks.
        if (x1 - x0 > 260 && y1 - y0 > 240 && random() < 0.5) {
          buildings.push({
            x: x0 + 8, y: y0 + 8, w: 90, h: 70,
            color: pick(random, buildingColors), height: 1,
          });
        }
      }
    }
  }

  // Parked cars on the parking lots.
  const parkedSpots = [];
  for (const lot of lots) {
    const n = randInt(random, 2, 5);
    for (let i = 0; i < n; i += 1) {
      parkedSpots.push({
        x: lot.x + 40 + random() * (lot.w - 80),
        y: lot.y + 30 + random() * (lot.h - 60),
        angle: random() < 0.5 ? 0 : Math.PI / 2,
      });
    }
  }

  return {
    roadsX,
    roadsY,
    buildings,
    parks,
    lots,
    parkedSpots,
    beachY: CITY.height - 200,
    waterY: CITY.height - 90,
  };
}

/** True when the point is on a road (within half a road width of a road centre). */
export function onRoad(city, x, y) {
  const half = CITY.roadWidth / 2;
  for (const rx of city.roadsX) if (Math.abs(x - rx) < half) return true;
  for (const ry of city.roadsY) if (Math.abs(y - ry) < half) return true;
  return false;
}

/** True when the point is inside a building or outside the city. */
export function blocked(city, x, y) {
  if (x < 8 || y < 8 || x > CITY.width - 8 || y > CITY.height - 8) return true;
  if (y > city.waterY) return true;
  for (const b of city.buildings) {
    if (x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h) return true;
  }
  return false;
}

/** The nearest road centre to a point (for traffic to snap onto). */
export function nearestRoadPoint(city, x, y) {
  let bestX = x;
  let bestD = Infinity;
  for (const rx of city.roadsX) {
    const d = Math.abs(x - rx);
    if (d < bestD) { bestD = d; bestX = rx; }
  }
  let bestY = y;
  bestD = Infinity;
  for (const ry of city.roadsY) {
    const d = Math.abs(y - ry);
    if (d < bestD) { bestD = d; bestY = ry; }
  }
  return { x: bestX, y: bestY };
}
