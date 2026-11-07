// One step for anything: 4-way only, refused into walls, blockers and off the map.
import { tileBlocks, blockerAt } from '../world.js';
import { makeNoise } from './noise.js';

// Returns 'moved', 'blocked' or 'invalid'.
export function tryStep(world, e, dx, dy) {
  dx = Math.sign(dx); dy = Math.sign(dy);
  if ((dx === 0) === (dy === 0)) return 'invalid'; // standing still or diagonal
  const nx = e.Position.x + dx, ny = e.Position.y + dy;
  const blocker = tileBlocks(world, nx, ny) ? null : blockerAt(world, nx, ny);
  if (tileBlocks(world, nx, ny) || blocker) {
    world.events.emit('move_blocked', { id: e.id, x: nx, y: ny, blockerId: blocker ? blocker.id : 0 });
    return 'blocked';
  }
  const from = { ...e.Position };
  e.Position.x = nx; e.Position.y = ny;
  world.events.emit('entity_moved', { id: e.id, from, to: { x: nx, y: ny } });
  // Footsteps: anything Noisy makes its move noise where it lands. Bumping makes none (no turn).
  // Sneaking makes them one level quieter.
  const level = e.Noisy ? e.Noisy.move - (e.Stealth && e.Stealth.sneaking ? 1 : 0) : 0;
  if (level > 0) makeNoise(world, nx, ny, level, e.id);
  return 'moved';
}
