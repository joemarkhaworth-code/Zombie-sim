// One step for anything: 4-way only, refused into walls, blockers, up cliffs and off the map.
import { tileBlocks, blockerAt, heightAllows } from '../world.js';
import { makeNoise, surfaceStep } from './noise.js';

// Returns 'moved', 'blocked' or 'invalid'.
export function tryStep(world, e, dx, dy) {
  dx = Math.sign(dx); dy = Math.sign(dy);
  if ((dx === 0) === (dy === 0)) return 'invalid'; // standing still or diagonal
  const nx = e.Position.x + dx, ny = e.Position.y + dy;
  if (!heightAllows(world, e.Position.x, e.Position.y, nx, ny)) {
    world.events.emit('move_blocked', { id: e.id, x: nx, y: ny, blockerId: 0, cliff: true });
    return 'blocked';
  }
  const blocker = tileBlocks(world, nx, ny) ? null : blockerAt(world, nx, ny);
  if (tileBlocks(world, nx, ny) || blocker) {
    world.events.emit('move_blocked', { id: e.id, x: nx, y: ny, blockerId: blocker ? blocker.id : 0 });
    return 'blocked';
  }
  const from = { ...e.Position };
  e.Position.x = nx; e.Position.y = ny;
  world.events.emit('entity_moved', { id: e.id, from, to: { x: nx, y: ny } });
  // Footsteps: anything Noisy makes its move noise where it lands, louder on gravel, leaves or a
  // dock, quieter on moss, needles or carpet. Bumping makes none (no turn).
  if (e.Noisy && e.Noisy.move > 0) makeNoise(world, nx, ny, e.Noisy.move, e.id, surfaceStep(world, nx, ny));
  return 'moved';
}
