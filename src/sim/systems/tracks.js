// Tracks (step 18): snow and mud, and the prints left in them.
//
// The ground is one state for the whole valley (like the weather):
//   world.snowCover - ticks of settled snow: builds while it snows, melts otherwise
//                     (faster in rain). Level 0-3 = ticks / CONFIG.tracks.snowPerLevel.
//   world.groundWet - ticks of wet ground (mud): builds in rain, dries otherwise.
// Prints: anything with Tracks { mark } that moves onto an outdoor tile leaves a print
// there if the tile holds snow (any outdoor walkable ground but water) or is soft and
// muddy (grass, lanes, paths, fell...). world.tracks: tile index -> { mark, dx, dy, t,
// in } (mark 'boots' for you, 'drag' for zombies; dx/dy the direction of travel; in
// 'snow' or 'mud'). A print lasts CONFIG.tracks.life ticks, much less while fresh snow
// falls on it or rain washes it. Prints are tile state: map memory remembers them.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from '../gen/testgrid.js';
import { indoorAt } from './weather.js';

const NO_SNOW = new Set([TILE.STREAM, TILE.LAKE, TILE.POND, TILE.VOID, TILE.TORRENT, TILE.FLOODWATER, TILE.FLOOD_IN]);
const MUDDY = new Set([TILE.STUMP, TILE.GRASS, TILE.LANE, TILE.PATH, TILE.FELL, TILE.BRACKEN, TILE.ALLOTMENT, TILE.GATE, TILE.FLOOR]);

export const snowLevel = (world) => Math.min(3, Math.floor((world.snowCover || 0) / CONFIG.tracks.snowPerLevel));
export const mudLevel = (world) => Math.min(3, Math.floor((world.groundWet || 0) / CONFIG.tracks.mudPerLevel));

// Does this tile show snow (for drawing and prints)?
// i: the tile index (an indoor floor under a lost roof takes snow).
export const holdsSnow = (world, t, i) => !NO_SNOW.has(t) && !TILE_INFO[t].blocks && (!TILE_INFO[t].indoor || (i !== undefined && !indoorAt(world, i)));

export function installTracks(world) {
  world.tracks = new Map();
  world.snowCover = 0;
  world.groundWet = 0;
  world.events.on('entity_moved', (d) => {
    const e = world.entities.get(d.id);
    if (!e || !e.Tracks) return;
    const i = d.to.y * world.width + d.to.x, t = world.tiles[i];
    const snow = snowLevel(world) >= 1 && holdsSnow(world, t, i);
    const silt = t === TILE.SILT || t === TILE.SILT_FLOOR; // flood silt always takes prints, indoors too
    const mud = !snow && (silt || (mudLevel(world) >= 1 && MUDDY.has(t) && !indoorAt(world, i)));
    if (!snow && !mud) return;
    world.tracks.set(i, { mark: e.Tracks.mark, dx: Math.sign(d.to.x - d.from.x), dy: Math.sign(d.to.y - d.from.y), t: world.tick, in: snow ? 'snow' : 'mud' });
  });
}

// Every tick: snow settles or melts, the ground wets or dries; old prints are pruned hourly.
export function tickTracks(world, weatherKind) {
  const T = CONFIG.tracks, cap = (per) => per * 4 - 1;
  const snowBefore = snowLevel(world);
  if (weatherKind === 'snow') world.snowCover = Math.min(cap(T.snowPerLevel), world.snowCover + 1);
  else if (world.snowCover > 0 && world.tick % (['rain', 'heavyRain'].includes(weatherKind) ? 1 : T.meltEvery) === 0) world.snowCover--;
  if (['rain', 'heavyRain'].includes(weatherKind)) world.groundWet = Math.min(cap(T.mudPerLevel), world.groundWet + 1);
  else if (world.groundWet > 0 && world.tick % T.dryEvery === 0) world.groundWet--;
  const snowNow = snowLevel(world);
  if (!snowBefore && snowNow) world.events.emit('snow_settled', {});
  if (snowBefore && !snowNow) world.events.emit('snow_melted', {});
  if (world.tick % 30 === 0) for (const [i, tr] of world.tracks) if (!trackAlive(world, tr, weatherKind)) world.tracks.delete(i);
}

function trackAlive(world, tr, weatherKind) {
  const T = CONFIG.tracks;
  const covering = (tr.in === 'snow' && weatherKind === 'snow') || (tr.in === 'mud' && ['rain', 'heavyRain'].includes(weatherKind));
  if (tr.in === 'snow' && snowLevel(world) === 0) return false; // melted away
  return world.tick - tr.t < (covering ? T.coveredLife : T.life);
}

// The print on (x, y), or null.
export function trackAt(world, x, y) {
  const tr = world.tracks && world.tracks.get(y * world.width + x);
  if (!tr) return null;
  return trackAlive(world, tr, world.weather && world.weather.kind) ? tr : null;
}
