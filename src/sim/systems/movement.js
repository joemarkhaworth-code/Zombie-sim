// One step for anything: 4-way only, refused into walls, blockers and off the map.
import { tileBlocks, blockerAt } from '../world.js';

// Returns 'moved', or 'blocked' (with the blocking entity, if any, as world.lastBlocker).
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
  return 'moved';
}
