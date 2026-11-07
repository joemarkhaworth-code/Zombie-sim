// Noise. makeNoise(world, x, y, level, byId) is the one entry point.
// Strength starts at noise.radiusByLevel[level] and drops 1 per tile (8 ways); entering a wall
// (an opaque or blocking tile) costs noise.wallCost more, so walls muffle rather than block.
// The map edge blocks. world.noise is a heatmap of everything heard since your last action
// (for the debug overlay).
// Anything with Hearing { level } on a tile the noise reaches at strength >=
// noise.minStrengthToHear[level] hears it (noise_heard). Zombies (Brain) that hear a noise and
// can't see prey make its source their goal: the newest noise wins; seeing prey always wins.
import { CONFIG } from '../../config.js';
import { inBounds, tileBlocks } from '../world.js';
import { opaqueAt } from './vision.js';

const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Strength per tile for a noise of `level` at (x, y).
export function spreadNoise(world, x, y, level) {
  const { w, h } = world, cfg = CONFIG.noise;
  const strength = new Int16Array(w * h);
  const start = cfg.radiusByLevel[level] || 0;
  if (start <= 0 || !inBounds(world, x, y)) return strength;
  strength[y * w + x] = start;
  const queue = [y * w + x];
  while (queue.length) {
    const i = queue.shift(), cx = i % w, cy = (i / w) | 0, s = strength[i];
    for (const [dx, dy] of DIRS8) {
      const nx = cx + dx, ny = cy + dy;
      if (!inBounds(world, nx, ny)) continue;
      const solid = opaqueAt(world, nx, ny) || tileBlocks(world, nx, ny);
      const ns = s - 1 - (solid ? cfg.wallCost : 0);
      const j = ny * w + nx;
      if (ns <= 0 || ns <= strength[j]) continue;
      strength[j] = ns;
      queue.push(j);
    }
  }
  return strength;
}

export function canHear(e, s) {
  if (!e.Hearing || s <= 0) return false;
  return s >= CONFIG.noise.minStrengthToHear[e.Hearing.level];
}

export function makeNoise(world, x, y, level, byId = 0) {
  if (level <= 0) return;
  const strength = spreadNoise(world, x, y, level);
  if (!world.noise) world.noise = new Int16Array(world.w * world.h);
  for (let i = 0; i < strength.length; i++) if (strength[i] > world.noise[i]) world.noise[i] = strength[i];
  world.events.emit('noise_made', { x, y, level, by: byId });
  for (const e of world.entities.values()) {
    if (e.id === byId || !e.Position || !e.Hearing) continue;
    const s = strength[e.Position.y * world.w + e.Position.x];
    if (!canHear(e, s)) continue;
    world.events.emit('noise_heard', { id: e.id, x, y, strength: s, by: byId });
    const b = e.Brain;
    if (b && !b.tracking) {
      b.goal = { x, y, why: 'heard' };
      b.search = null;
    }
  }
}

// Called at the start of each player action: the heatmap shows noise since then.
export function clearNoise(world) {
  if (world.noise) world.noise.fill(0);
}
