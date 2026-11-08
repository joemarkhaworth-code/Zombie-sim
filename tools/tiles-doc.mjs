// Writes docs/tiles.md: every tile, structure, object, marker and roof the game uses, from the
// game's own data, for redesigning the art. Run: node tools/tiles-doc.mjs
import { writeFileSync } from 'fs';
import { CONFIG } from '../src/config.js';
import { TILE_INFO } from '../src/sim/tiles.js';
import { GROUND, STRUCT, OBJECT, MARKER, ROOF } from '../src/sim/map.js';

const T = Object.fromEntries(TILE_INFO.map(t => [t.key, t]));
const col = k => (CONFIG.colours.tiles[k] || []).map(c => '`' + c + '`').join(' ');
const yes = v => (v ? 'yes' : '');
const step = s => (s === 'loud' ? 'loud' : s === 'quiet' ? 'quiet' : '');
const out = [];
out.push('# Tiles, for redesigning the art', '',
  'Everything the game draws on the map, generated from the game\'s own data (`node tools/tiles-doc.mjs`).',
  'The picture [tiles.png](tiles.png) shows each one as it\'s drawn now (greybox).', '',
  '**How tiles work**', '',
  '- One tile is one square, about one person. On a phone a tile is drawn at 32-41 px (art at 16 x 16 or 32 x 32 scales cleanly).',
  '- The camera looks north, a little from above: you see the tops of things and the south faces of walls.',
  '- Each map tile is a stack of layers, drawn bottom to top: height, ground, structure, object, roof. Markers are editor-only.',
  '- Height: each level (0-3) is drawn a shade lighter, and a cliff face appears on the lower tile wherever the next tile up is higher (tall face on the north side, a lip on the others). Steps and ledges sit on the edge.',
  '- Remembered tiles (out of sight) are drawn again in dark greys worked out from the colours, so every tile needs to read in greyscale too.',
  '- "Char" is the character in the map text; never change one (maps depend on them).',
  '- Some tiles take their direction from their neighbours (fences, rails, bridges, doors, carriages): they need a north-south and an east-west version, and ideally ends and corners.', '');

out.push('## 1. Ground', '', 'What you walk on. Colours are [base, mark].', '',
  '| Char | Name | Key | Blocks | See through | Footsteps | Colours |', '|---|---|---|---|---|---|---|');
for (const [c, k, label] of GROUND) {
  const t = T[k];
  out.push(`| \`${c}\` | ${label} | ${k} | ${yes(t.blocks)} | ${t.opaque ? 'no' : 'yes'} | ${step(t.step)} | ${col(k === 'FLOOR' ? 'FLOORWOOD' : k)} |`);
}
out.push('', '## 2. Structures', '', 'Walls, openings, fences and crossings, on top of the ground.', '',
  '| Char | Name | Blocks movement | Blocks sight | Muffles noise | Notes |', '|---|---|---|---|---|---|');
for (const [c, k, label, i] of STRUCT.slice(1)) {
  const notes = [i.wall && 'building wall', i.opening && 'goes in a wall', i.fence && 'fence line', i.pass && 'walkable over anything', i.step && `${i.step} footsteps`,
    k === 'STEPS' && 'joins two heights', k === 'LEDGE' && 'one-way drop'].filter(Boolean).join(', ');
  out.push(`| \`${c}\` | ${label} | ${yes(i.blocks)} | ${yes(i.opaque)} | ${yes(i.muffles)} | ${notes} |`);
}
const W = CONFIG.colours.layers.walls;
out.push('', 'Wall colours [base, lines]: ' + Object.entries(W).map(([k, v]) => `${k} \`${v[0]}\` \`${v[1]}\``).join(', ') + '.');
out.push('', '## 3. Objects', '', 'Things with a footprint (width x height in tiles; turned, they swap). Drawn whole over their footprint.', '',
  '| Char | Name | Size | Blocks movement | Blocks sight | Colour |', '|---|---|---|---|---|---|');
const groups = { CAR: 'Vehicles', TREE: 'Trees and the woods', SIGN: 'Roadside', CRATE: 'Indoors' };
for (const [c, k, label, i] of OBJECT.slice(1)) {
  if (groups[k]) out.push(`| | **${groups[k]}** | | | | |`);
  out.push(`| \`${c}\` | ${label} | ${i.w} x ${i.h} | ${yes(i.blocks)} | ${yes(i.opaque)} | ${i.colour ? '`' + i.colour + '`' : ''} |`);
}
out.push('', '## 4. Roofs', '', 'A roof covers a building: shown from outside, hidden while you\'re inside it. Needs edges (eaves) and ideally a ridge.', '',
  '| Char | Name | Colours |', '|---|---|---|');
ROOF.slice(1).forEach(([c, , label], k) => { const p = CONFIG.colours.layers.roofs[k + 1]; out.push(`| \`${c}\` | ${label} | \`${p[0]}\` \`${p[1]}\` |`); });
out.push('', '## 5. Markers (editor only)', '', '| Char | Name |', '|---|---|');
for (const [c, , label] of MARKER.slice(1)) out.push(`| \`${c}\` | ${label} |`);
out.push('', '## 6. Creatures and items', '', 'Drawn as letters for now, always one tile.', '',
  '| Glyph | What | Colour |', '|---|---|---|',
  `| @ | you | \`${CONFIG.colours.player}\` |`, `| Z | zombie | \`${CONFIG.colours.zombie}\` |`, '| % | zombie corpse | `' + CONFIG.colours.corpse + '` |');
for (const [k, it] of Object.entries(CONFIG.items)) out.push(`| ${it.glyph === '|' ? '\\|' : it.glyph} | ${it.name} | \`${it.colour}\` |`);
out.push('', 'Badges over zombies: yellow `!` (after you), grey `?` (looking for you).', '',
  '## 7. Old region tiles', '', 'Used only by the built-in region map (src/sim/gen/region.js) until your maps replace it; not in the editor. ' +
  TILE_INFO.filter(t => !GROUND.some(g => g[1] === t.key) && !t.part).map(t => t.key.toLowerCase().replace(/_/g, ' ')).join(', ') +
  ', and the building-token roofs and walls (slate / red tiles / metal / flat / glass roofs by slope; stone / brick / render / wood / metal walls with windows, doors and shopfronts).');
writeFileSync(new URL('../docs/tiles.md', import.meta.url), out.join('\n') + '\n');
console.log('docs/tiles.md', out.length, 'lines');
