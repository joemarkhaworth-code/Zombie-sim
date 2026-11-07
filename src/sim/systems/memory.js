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

// Snapshot every tile in view (view: visibility per tile, 0 = out of sight), within the box
// x0..x1, y0..y1 (the screen you're looking at; the whole map if not given). Things are
// gathered in one pass over the entities, not one per tile.
export function updateMemory(world, e, view, x0 = 0, y0 = 0, x1 = world.w, y1 = world.h) {
  if (!e.Memory) return;
  const mem = e.Memory.tiles, w = world.w;
  const things = new Map();
  for (const t of world.entities.values()) {
    if (!t.Position || t.Actor || !t.Glyph) continue;
    const { x, y } = t.Position;
    if (x < x0 || y < y0 || x >= x1 || y >= y1 || !view[y * w + x]) continue;
    const i = y * w + x;
    if (!things.has(i)) things.set(i, []);
    things.get(i).push({ ch: t.Glyph.ch, colour: t.Glyph.colour, name: t.Name ? t.Name.name : '' });
  }
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = y * w + x;
      if (view[i]) mem[i] = { t: world.tiles[i], things: things.get(i) || [] };
    }
  }
}

export function remembered(e, world, x, y) {
  return e.Memory ? e.Memory.tiles[y * world.w + x] || null : null;
}
