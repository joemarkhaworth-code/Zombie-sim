// Bleeding: a wound sets Bleeding level 1-3 (it can get worse with more wounds).
// Every CONFIG.bleeding.intervalByLevel[level] ticks the creature loses 1 health
// and drips blood on its tile; each drip it may clot down a level. Level 0 = stopped.
// Blood: world.blood holds a 0-3 level per tile (tile state: memory snapshots record it).
import { CONFIG } from '../../config.js';
import { query, inBounds } from '../world.js';
import { damage } from './combat.js';

export function installBleeding(world) {
  world.blood = new Uint8Array(world.width * world.height);
}

export function addBlood(world, x, y, amount) {
  if (!inBounds(world, x, y)) return;
  const i = y * world.width + x;
  world.blood[i] = Math.min(3, world.blood[i] + amount);
}

export function wound(world, e) {
  if (!e.Health) return;
  const b = e.Bleeding || (e.Bleeding = { level: 0, timer: 0 });
  const before = b.level;
  b.level = Math.min(3, b.level + 1);
  if (b.level !== before) world.events.emit('bleeding_started', { id: e.id, level: b.level });
}

// Called once per scheduler tick.
export function tickBleeding(world) {
  for (const e of query(world, 'Bleeding', 'Health', 'Position')) {
    const b = e.Bleeding;
    if (b.level <= 0) continue;
    b.timer++;
    if (b.timer < CONFIG.bleeding.intervalByLevel[b.level]) continue;
    b.timer = 0;
    addBlood(world, e.Position.x, e.Position.y, 1);
    if (world.rng.chance(CONFIG.bleeding.clotChance)) {
      b.level--;
      if (b.level === 0) world.events.emit('bleeding_stopped', { id: e.id });
    }
    damage(world, e, 1, { cause: 'bleeding' });
  }
}
