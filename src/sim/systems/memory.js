// Map memory. A Memory component keeps a snapshot of each tile as it looked when last seen:
// the terrain plus any non-creature things on it (items, doors... later damage and barricades:
// add new tile state in snapshotTile()). Never the live tile, and creatures are never
// remembered. A snapshot only updates while the tile is in view, so the remembered map can be
// out of date. Plain data, so it can be saved (step 11).
//   Memory { tiles: { [index]: { t: terrain, things: [{ ch, colour, name }] } } }

export function snapshotTile(world, x, y) {
  const things = [];
  for (const e of world.entities.values()) {
    if (!e.Position || e.Actor || !e.Glyph) continue; // creatures (anything that acts) aren't remembered
    if (e.Position.x !== x || e.Position.y !== y) continue;
    things.push({ ch: e.Glyph.ch, colour: e.Glyph.colour, name: e.Name ? e.Name.name : '' });
  }
  return { t: world.tiles[y * world.w + x], things };
}

// Snapshot every tile in view (view: visibility per tile, 0 = out of sight).
export function updateMemory(world, e, view) {
  if (!e.Memory) return;
  const mem = e.Memory.tiles;
  for (let i = 0; i < view.length; i++) {
    if (!view[i]) continue;
    mem[i] = snapshotTile(world, i % world.w, (i / world.w) | 0);
  }
}

export function remembered(e, world, x, y) {
  return e.Memory ? e.Memory.tiles[y * world.w + x] || null : null;
}
