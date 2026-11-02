// Gales: storms that change the map (after step 20).
//
// A gale is a weather kind (CONFIG.weather.kinds.gale: wind: true). When one blows up it
// picks a wind direction (world.weather.wind, saved with the weather). Each tick in a gale
// (all chances in CONFIG.storm):
//   - a tree somewhere may come down: it leaves a STUMP (you can see past it now) and lies
//     downwind as FALLEN_TREE across the next tiles - slow to clamber over, noisy, blocks
//     sight, hides you, burns. Whatever it lands on is crushed. A crash (noise 3) that
//     zombies come to.
//   - a roof may lose slates: a 2x2 patch opens to the sky (fire.js loseRoof), so rain,
//     cold and light get in there. Thatch goes twice as easily.
//   - a greenhouse pane may blow in: the glass wall becomes a gap with broken glass.
//   - anyone out in it may be hit by flying debris.
// These are lasting: nothing grows back or gets mended unless someone does it.
import { CONFIG } from '../../config.js';
import { TILE, TILE_INFO } from '../gen/testgrid.js';
import { makeNoise } from './noise.js';
import { damage } from './combat.js';
import { loseRoof } from './fire.js';
import { indoorAt } from './weather.js';
import { refreshAllVision } from './vision.js';
import { structureAt } from './structures.js';

const WINDS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];

export function installStorm(world) {
  world.events.on('weather_changed', (d) => {
    if (CONFIG.weather.kinds[d.to] && CONFIG.weather.kinds[d.to].wind && world.weather) world.weather.wind = WINDS[world.rng.int(WINDS.length)];
  });
}

const isGale = (world) => !!(world.weather && CONFIG.weather.kinds[world.weather.kind] && CONFIG.weather.kinds[world.weather.kind].wind);

// A random tile of type t on the land (up to `tries` guesses from a list made when needed).
function randomTile(world, t) {
  const land = world.landHeight || world.height;
  world.stormCache = world.stormCache || {};
  let list = world.stormCache[t];
  if (!list || world.tick - list.at > 360) { // refresh every few hours (fire and storms change things)
    list = { at: world.tick, tiles: [] };
    for (let i = 0; i < land * world.width; i++) if (world.tiles[i] === t) list.tiles.push(i);
    world.stormCache[t] = list;
  }
  for (let k = 0; k < 6 && list.tiles.length; k++) {
    const i = list.tiles[world.rng.int(list.tiles.length)];
    if (world.tiles[i] === t) return i;
  }
  return -1;
}

// Every tick.
export function tickStorm(world) {
  if (!isGale(world)) return;
  const S = CONFIG.storm;
  if (world.rng.chance(S.treeFall)) { const i = randomTile(world, TILE.TREE); if (i >= 0) fellTree(world, i); }
  if (world.rng.chance(S.roofLoss)) stripRoof(world);
  if (world.rng.chance(S.glassBreak)) { const i = randomTile(world, TILE.WALL_GLASS); if (i >= 0) blowPane(world, i); }
  for (const e of [...world.entities.values()]) {
    if (!e.Needs || !e.Position || !e.Health || indoorAt(world, e.Position.y * world.width + e.Position.x)) continue;
    if (world.rng.chance(S.debrisChance)) {
      world.events.emit('debris_hit', { id: e.id });
      damage(world, e, 1, { cause: 'debris' });
    }
  }
}

// The tree at tile i comes down with the wind.
export function fellTree(world, i, wind = world.weather && world.weather.wind) {
  const S = CONFIG.storm, W = world.width;
  const [dx, dy] = wind || [1, 0];
  const x = i % W, y = (i - x) / W;
  world.tiles[i] = TILE.STUMP;
  const lies = [];
  for (let k = 1; k <= S.fallLength; k++) {
    const tx = x + dx * k, ty = y + dy * k, j = ty * W + tx;
    if (tx < 0 || ty < 0 || tx >= W || ty >= world.height) break;
    const t = world.tiles[j];
    if (TILE_INFO[t].blocks || TILE_INFO[t].indoor || TILE_INFO[t].silent || structureAt(world, tx, ty)) break; // walls and houses stop it
    if ([TILE.STREAM, TILE.TORRENT, TILE.FLOODWATER, TILE.ICE].includes(t)) { lies.push({ x: tx, y: ty }); continue; } // into the water: it's carried off
    world.tiles[j] = TILE.FALLEN_TREE;
    lies.push({ x: tx, y: ty });
  }
  world.events.emit('tree_fell', { x, y, dx, dy });
  makeNoise(world, x + dx, y + dy, S.fallNoise);
  for (const p of lies) for (const e of [...world.entities.values()]) {
    if (e.Health && e.Position && e.Position.x === p.x && e.Position.y === p.y) {
      world.events.emit('crushed', { id: e.id, x: p.x, y: p.y });
      damage(world, e, S.crushDamage, { cause: 'tree' });
    }
  }
  refreshAllVision(world);
}

// A roof loses slates: a 2x2 patch of some building opens to the sky.
function stripRoof(world) {
  const bs = (world.buildings || []).filter((b) => b.roof !== 'glass' && b.w > 3 && b.h > 3);
  if (!bs.length) return;
  // Thatch counts twice.
  const weighted = bs.flatMap((b) => (b.roof === 'thatch' ? [b, b] : [b]));
  const b = weighted[world.rng.int(weighted.length)];
  const x = b.x + 1 + world.rng.int(b.w - 3), y = b.y + 1 + world.rng.int(b.h - 3);
  let lost = 0;
  for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const i = (y + oy) * world.width + x + ox;
    if (indoorAt(world, i)) { loseRoof(world, i); lost++; }
  }
  if (!lost) return;
  world.events.emit('roof_damaged', { x, y });
  makeNoise(world, x, y, CONFIG.storm.roofNoise);
}

// A greenhouse pane blows in.
function blowPane(world, i) {
  const x = i % world.width, y = (i - x) / world.width;
  world.tiles[i] = TILE.FLOOR_EARTH;
  world.glass[i] = Math.max(world.glass[i], 2);
  if (world.tileHp) world.tileHp[i] = 0;
  world.events.emit('pane_blown', { x, y });
  makeNoise(world, x, y, CONFIG.materials.glass.breakNoise);
  refreshAllVision(world);
}
