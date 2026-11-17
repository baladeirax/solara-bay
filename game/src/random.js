// A small seeded random number generator (mulberry32): the same seed gives the same city,
// the same traffic and the same screenshot scenes, which is what makes the game repeatable.

export function createRandom(seed) {
  let a = seed | 0;
  return function random() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A random integer in [min, max). */
export function randInt(random, min, max) {
  return min + Math.floor(random() * (max - min));
}

/** One of the given values, picked by the seeded generator. */
export function pick(random, values) {
  return values[Math.floor(random() * values.length)];
}
