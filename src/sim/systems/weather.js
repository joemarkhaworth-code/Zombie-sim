// Weather (step 17). world.weather = { kind, until } - one weather for the whole map
// (it's one valley), changing every few hours by a seeded chain (CONFIG.weather.kinds:
// each kind has hours [min, max] and weighted next kinds; fog only forms in the morning).
// What it does, all as data on the kind:
//  - light: cloudy kinds hide the moon (night outdoors goes from 1 to 0); dayDrop dims
//    the day (heavy rain, snow). light.js asks ambientFor().
//  - sight: outdoors, sight radius x sight (fog ~1/3, rain 0.8...). vision.js.
//  - hearing: outdoors, heard noise is mask weaker (rain drowns footsteps). noise.js.
//  - wet: how wet you get outdoors (level 0-3 to drift toward); chill [day, night]: how
//    cold it is outdoors. needs.js turns these into your Wet and Cold.
//  - scentWash, fireDamp: for scent (step 18) and fire (step 19).
// Changing weather emits weather_changed and refreshes light and vision.
import { CONFIG } from '../../config.js';
import { TILE_INFO } from '../gen/testgrid.js';

const HOUR = () => 60 / CONFIG.time.minutesPerTick; // ticks per hour

export const weatherOf = (world) => CONFIG.weather.kinds[(world.weather && world.weather.kind) || 'clear'];

export const isIndoors = (world, x, y) => !!TILE_INFO[world.tiles[y * world.width + x]].indoor;

export function installWeather(world) {
  const W = CONFIG.weather;
  const k = W.kinds[W.start];
  world.weather = { kind: W.start, until: world.tick + HOUR() * (k.hours[0] + world.rng.int(k.hours[1] - k.hours[0] + 1)) };
}

// Hour of day (0-23) at this tick.
const hourAt = (tick) => Math.floor((CONFIG.time.startHour * 60 + tick * CONFIG.time.minutesPerTick) / 60) % 24;

// Called at the end of every player turn. Returns true if the weather changed.
export function tickWeather(world) {
  if (!world.weather || world.tick < world.weather.until) return false;
  const W = CONFIG.weather, from = world.weather.kind;
  const hour = hourAt(world.tick);
  const options = Object.entries(W.kinds[from].next).filter(([k]) => !W.kinds[k].hoursOfDay || (hour >= W.kinds[k].hoursOfDay[0] && hour <= W.kinds[k].hoursOfDay[1]));
  let r = world.rng.next() * options.reduce((a, [, w]) => a + w, 0), to = options[options.length - 1][0];
  for (const [k, w] of options) { r -= w; if (r < 0) { to = k; break; } }
  const k = W.kinds[to];
  world.weather = { kind: to, until: world.tick + HOUR() * (k.hours[0] + world.rng.int(k.hours[1] - k.hours[0] + 1)) };
  if (to !== from) world.events.emit('weather_changed', { from, to });
  return to !== from;
}

// The hour's daylight (0-3) as the weather leaves it.
export function ambientFor(world, base) {
  const k = weatherOf(world);
  if (base <= 1) return k.cloudy ? 0 : base; // cloud hides the moon
  return Math.max(1, base - (k.dayDrop || 0));
}

// Outdoors, the weather shortens sight and drowns sound.
export const sightFactor = (world, e) => (e.Position && !isIndoors(world, e.Position.x, e.Position.y) ? weatherOf(world).sight : 1);
export const hearingMask = (world, e) => (e.Position && !isIndoors(world, e.Position.x, e.Position.y) ? weatherOf(world).mask : 0);

// Debug (TUNE panel): force a weather for `hours` (it then carries on changing as usual).
export function setWeather(world, kind, hours = 24) {
  const from = world.weather ? world.weather.kind : null;
  world.weather = { kind, until: world.tick + HOUR() * hours };
  if (from !== kind) world.events.emit('weather_changed', { from, to: kind });
}
export const WEATHER_KINDS = () => Object.keys(CONFIG.weather.kinds);
