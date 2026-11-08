// What needs drawing: every tile, structure, object, roof, creature and item the game uses,
// built from the game's own data (so a new kind shows up here by itself). Pure: no DOM.
// Each entry: { id, group, name, char, w, h (in tiles), variants: [names], notes }.
import { CONFIG } from '../src/config.js';
import { TILE_INFO } from '../src/sim/tiles.js';
import { GROUND, STRUCT, OBJECT, ROOF, kinds, kindOf } from '../src/sim/map.js';

import { PX } from '../src/artdata.js';
export { PX, CHARS, PALETTE, nearestColour, emptyArt, encode, decode, serializeArt, parseArt, versionAt } from '../src/artdata.js';

const DIRECTIONAL = new Set(['rail', 'picket', 'chain', 'barbed', 'board', 'gate', 'guard', 'bridge', 'dock', 'tracks', 'hedge', 'stonewall']);

// A new kind that has been deleted keeps its table row until the page reloads: skip it.
const gone = (layer, v) => { const d = kindOf(layer, v); return d && !kinds.has(`${layer}:${d.key}`); };
const isNew = (layer, v) => !!kindOf(layer, v);
export function catalogue() {
  const out = [];
  const T = Object.fromEntries(TILE_INFO.map(t => [t.key, t]));
  for (const [v, [c, k, name]] of GROUND.entries()) {
    if (gone('ground', v)) continue;
    const t = T[k];
    const notes = [t.blocks ? 'blocks movement' : 'walkable', t.opaque ? 'blocks sight' : '', t.step ? `${t.step} footsteps` : '', 'fills the whole tile; should tile seamlessly'].filter(Boolean).join(', ');
    out.push({ id: `ground:${k}`, group: 'Ground', name, char: c, w: 1, h: 1, variants: ['main'], notes, custom: isNew('ground', v) });
  }
  out.push({ id: 'height:cliff', group: 'Height', name: 'cliff face', char: '', w: 1, h: 1, variants: ['north face (tall)', 'east/west side', 'south lip'],
    notes: 'drawn over the lower tile wherever the next tile up is higher; leave the rest transparent' });
  for (const [v, [c, k, name, info]] of STRUCT.entries()) {
    if (!v || gone('struct', v)) continue;
    let variants = ['main'];
    if (DIRECTIONAL.has(info.look) || (info.custom && info.fence)) variants = ['east-west', 'north-south'];
    else if (info.opening) variants = ['in an east-west wall', 'in a north-south wall'];
    else if (k === 'LEDGE') variants = ['drop to the south', 'drop to the east or west'];
    const notes = [info.blocks ? 'blocks movement' : 'walkable', info.opaque ? 'blocks sight' : 'see-through', info.wall ? 'a building wall (seen from above: draw the wall top and south face)' : '',
      info.pass ? 'over water or anything' : '', 'transparent pixels show the ground under it'].filter(Boolean).join(', ');
    out.push({ id: `struct:${k}`, group: 'Structures', name, char: c, w: 1, h: 1, variants, notes, custom: isNew('struct', v) });
  }
  for (const [v, [c, k, name, info]] of OBJECT.entries()) {
    if (!v || gone('object', v)) continue;
    const variants = info.w !== info.h ? ['main', 'turned'] : ['main'];
    const notes = [`${info.w} x ${info.h} tiles`, info.blocks ? 'blocks movement' : 'walkable', info.opaque ? 'blocks sight' : 'see-through',
      variants.length > 1 ? `turned is ${info.h} x ${info.w}` : '', 'transparent pixels show the ground'].filter(Boolean).join(', ');
    out.push({ id: `object:${k}`, group: 'Objects', name, char: c, w: info.w, h: info.h, variants, notes, custom: isNew('object', v) });
  }
  for (const [v, [c, k, name]] of ROOF.entries()) {
    if (!v || gone('roof', v)) continue;
    out.push({ id: `roof:${k}`, group: 'Roofs', name, char: c, w: 1, h: 1, variants: ['middle', 'edge (eaves)'], notes: 'covers a building; should tile seamlessly', custom: isNew('roof', v) });
  }
  out.push({ id: 'creature:player', group: 'Creatures and items', name: 'you', char: '@', w: 1, h: 1, variants: ['main'], notes: 'always on top; transparent background' });
  out.push({ id: 'creature:zombie', group: 'Creatures and items', name: 'zombie', char: 'Z', w: 1, h: 1, variants: ['main'], notes: 'the slow shambler; transparent background' });
  out.push({ id: 'creature:corpse', group: 'Creatures and items', name: 'zombie corpse', char: '%', w: 1, h: 1, variants: ['main'], notes: 'lies on the ground, walkable' });
  for (const [k, it] of Object.entries(CONFIG.items)) out.push({ id: `item:${k}`, group: 'Creatures and items', name: it.name, char: it.glyph, w: 1, h: 1, variants: ['main'], notes: 'an item lying on the ground; small, transparent background' });
  return out;
}

