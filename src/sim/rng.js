// Seeded RNG (mulberry32). Every random choice in the sim must come from here.
export function createRng(seed) {
  let a = seed >>> 0;
  const rng = {
    next() {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    int(n) { return Math.floor(rng.next() * n); },
    chance(p) { return rng.next() < p; },
    get state() { return a; },
  };
  return rng;
}
