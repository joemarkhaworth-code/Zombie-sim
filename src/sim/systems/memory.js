// Map memory: anything with a Memory component keeps a snapshot of each tile as it
// looked when last seen. The snapshot only updates when the tile is in view again,
// so the remembered map can be out of date (a door you saw shut stays shut in your
// memory until you see it again). Creatures (anything with Actor) are never remembered.
//
// Snapshot: { tile, blood, things: [{ name, char, fg, bg }] }
//   tile   - terrain type as seen
//   blood  - blood level 0-3 as seen
//   glass  - broken glass level 0-3 as seen
//   doors, windows and barricades are things (their glyph/name record open/shut/broken)
//   things - non-creature entities on the tile (items, doors, fires... as they arrive)
// When tiles gain more state (damage, door open/shut, barricade HP) add it in
// snapshotTile() so memory records it too.
// Snapshots are plain data, so memory can be saved and loaded.
import { query, inBounds } from '../world.js';
import { trackAt } from './tracks.js';

// Snapshots refresh whenever the viewer's sight changes (it moved) and at the end of
// every turn (things may have changed in view while it stood still).
export function installMemory(world) {
  world.events.on('vision_updated', (d) => {
    const e = world.entities.get(d.id);
    if (e && e.Memory) rememberVisible(world, e);
  });
  world.events.on('turn_ended', () => {
    for (const e of query(world, 'Memory', 'Vision')) rememberVisible(world, e);
  });
}

export function createMemory(world) {
  return { tiles: new Array(world.width * world.height).fill(null) };
}

function rememberVisible(world, e) {
  const thingsAt = new Map(); // tile index -> non-creature entities there
  for (const t of query(world, 'Position', 'Glyph')) {
    if (t.Actor) continue;
    const idx = t.Position.y * world.width + t.Position.x;
    if (!thingsAt.has(idx)) thingsAt.set(idx, []);
    thingsAt.get(idx).push(t);
  }
  const mem = e.Memory.tiles;
  for (const idx of e.Vision.visible.keys()) mem[idx] = snapshotTile(world, idx, thingsAt.get(idx) || []);
}

function trackSnap(world, idx) {
  const tr = trackAt(world, idx % world.width, Math.floor(idx / world.width));
  return tr ? { mark: tr.mark, dx: tr.dx, dy: tr.dy, in: tr.in } : null;
}

function snapshotTile(world, idx, things) {
  return {
    tile: world.tiles[idx],
    blood: world.blood ? world.blood[idx] : 0,
    glass: world.glass ? world.glass[idx] : 0,
    track: trackSnap(world, idx), // prints in snow or mud (step 18)
    things: things.map((t) => ({
      name: t.Name ? t.Name.name : 'something',
      char: t.Glyph.char, fg: t.Glyph.fg, bg: t.Glyph.bg,
    })),
  };
}

// What a viewer remembers at (x, y): a snapshot, or null if never seen.
export function rememberedAt(world, e, x, y) {
  if (!e.Memory || !inBounds(world, x, y)) return null;
  return e.Memory.tiles[y * world.width + x];
}
