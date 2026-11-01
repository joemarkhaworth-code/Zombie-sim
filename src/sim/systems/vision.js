// Vision: anything with a Vision component sees tiles within its sight range,
// blocked by opaque tiles (rot.js recursive shadowcasting). Entities don't block sight.
// A viewer's visible set only changes when the viewer moves (or, later, when tiles change),
// so it's recomputed on entity_moved.
import { CONFIG } from '../../config.js';
import { inBounds, tileAt, query } from '../world.js';
import { TILE_INFO } from '../gen/testgrid.js';
import RecursiveShadowcasting from '../../lib/rot/fov/recursive-shadowcasting.js';

export function installVision(world) {
  const fov = new RecursiveShadowcasting(
    (x, y) => inBounds(world, x, y) && !TILE_INFO[tileAt(world, x, y)].opaque,
  );
  world.fov = fov;
  world.sightings = new Set(); // actor ids the player could see at the end of last turn
  world.events.on('entity_moved', (d) => {
    const e = world.entities.get(d.id);
    if (e && e.Vision) updateVision(world, e);
  });
}

export function updateVision(world, e) {
  const range = CONFIG.vision.rangeByLevel[e.Vision.level];
  const visible = new Set();
  world.fov.compute(e.Position.x, e.Position.y, range, (x, y) => {
    if (inBounds(world, x, y)) visible.add(y * world.width + x);
  });
  e.Vision.visible = visible;
}

export function refreshAllVision(world) {
  for (const e of query(world, 'Vision', 'Position')) updateVision(world, e);
}

export function canSee(world, viewer, target) {
  return !!viewer.Vision && viewer.Vision.visible.has(target.Position.y * world.width + target.Position.x);
}

// End of turn: emit entity_seen for actors that newly came into the player's view.
export function updateSightings(world) {
  const player = world.entities.get(world.playerId);
  if (!player) return;
  const now = new Set();
  for (const e of query(world, 'Actor', 'Position')) {
    if (e.id !== player.id && canSee(world, player, e)) now.add(e.id);
  }
  for (const id of now) {
    if (!world.sightings.has(id)) world.events.emit('entity_seen', { viewerId: player.id, id });
  }
  world.sightings = now;
}
