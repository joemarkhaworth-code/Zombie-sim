// Needs (step 16): hunger, thirst and fatigue.
//
// Needs { hunger, thirst, fatigue } counts ticks (2 minutes each). The level 0-3 is
// ticks / CONFIG.needs.perLevel[need] (capped at 3): 0 fine, 1 peckish/thirsty/tired,
// 2 hungry/very thirsty/very tired, 3 starving/parched/exhausted. Only levels show on
// screen (H/T/Z marks in the top bar) and in messages when a level changes.
//   - Hunger and thirst rise every tick. Food and drink (CONFIG.items food/drink, in
//     ticks) bring them down; you can drink straight from a beck or the lake.
//   - Fatigue rises every tick awake and falls sleepRecovery per tick asleep.
//   - Starving loses 1 health every starveEvery ticks; parched every parchedEvery.
//   - Exhausted makes every action exhaustedCost x as long (turn.js), so zombies get more
//     time.
//   - Healing: asleep and not starving/parched, +1 health every sleepHealEvery ticks;
//     awake, fed, watered and rested (all <= 1) and not bleeding, every restHealEvery.
// Sleeping (Asleep component, turn.js) runs the world until you wake: rested, or woken by
// a noise you hear, by being hurt, or by hunger or thirst becoming dire.
// Timers use world.tick, so runs replay exactly.
import { CONFIG } from '../../config.js';
import { damage } from './combat.js';
import { weatherOf, isIndoors } from './weather.js';
import { TILE } from '../gen/testgrid.js';
import { minutesAt } from '../time.js';

const NEEDS = ['hunger', 'thirst', 'fatigue', 'wet', 'cold', 'ill'];

// Wet and cold (step 17): the level each drifts toward where you are now.
const isNight = (tick) => CONFIG.light.byHour[Math.floor(minutesAt(tick) / 60) % 24] <= 1;
export function wetTarget(world, e) {
  if (isIndoors(world, e.Position.x, e.Position.y)) return 0;
  const held = e.Inventory && e.Inventory.wielded && world.entities.get(e.Inventory.wielded);
  const cover = (held && CONFIG.items[held.Item.type].rainCover) || 0; // a brolly keeps the rain off
  return Math.max(0, weatherOf(world).wet - cover);
}
export function coldTarget(world, e) {
  let c = weatherOf(world).chill[isNight(world.tick) ? 1 : 0];
  if (needLevel(e, 'wet') >= 2) c++; // soaked through
  if (isIndoors(world, e.Position.x, e.Position.y)) c -= CONFIG.needs.shelter;
  return Math.max(0, Math.min(3, c));
}

export const needLevel = (e, need) => (e && e.Needs && e.Needs[need] !== undefined ? Math.min(3, Math.floor(e.Needs[need] / CONFIG.needs.perLevel[need])) : 0);

const cap = (need) => CONFIG.needs.perLevel[need] * 4 - 1; // never more than "level 3, and a bit"
// (wet and cold top out at exactly level 3: they drift toward a target)

export function installNeeds(world) {
  // Wading a beck soaks you.
  world.events.on('entity_moved', (d) => {
    const e = world.entities.get(d.id);
    if (!e || !e.Needs || ![TILE.STREAM, TILE.FLOODWATER, TILE.FLOOD_IN].includes(world.tiles[d.to.y * world.width + d.to.x])) return;
    const soaked = CONFIG.needs.wadeWet * CONFIG.needs.perLevel.wet;
    if (e.Needs.wet < soaked) adjustNeed(world, e, 'wet', soaked - e.Needs.wet);
  });
  // Woken by a noise, or by being hurt.
  world.events.on('noise_heard', (d) => { const e = world.entities.get(d.id); if (e && e.Asleep) wake(world, e, 'noise'); });
  world.events.on('entity_damaged', (d) => { const e = world.entities.get(d.id); if (e && e.Asleep) wake(world, e, 'hurt'); });
}

export function wake(world, e, reason) {
  if (!e.Asleep) return;
  delete e.Asleep;
  world.events.emit('woke', { id: e.id, reason });
}

// Change a need by `by` ticks (negative = relief), emitting need_changed when the level moves.
export function adjustNeed(world, e, need, by) {
  const before = needLevel(e, need);
  e.Needs[need] = Math.max(0, Math.min(cap(need), e.Needs[need] + by));
  const after = needLevel(e, need);
  if (after !== before) world.events.emit('need_changed', { id: e.id, need, level: after, from: before });
}

// Every tick.
export function tickNeeds(world) {
  const N = CONFIG.needs, t = world.tick;
  for (const e of [...world.entities.values()]) {
    if (!e.Needs || !world.entities.has(e.id)) continue;
    const asleep = !!e.Asleep;
    adjustNeed(world, e, 'hunger', 1);
    const ill = needLevel(e, 'ill'); // illness (step 20): thirstier; at 2+ it wears you out
    adjustNeed(world, e, 'thirst', ill ? 2 : 1);
    const shivering = needLevel(e, 'cold') >= N.coldTiresFrom; // cold wears you out
    adjustNeed(world, e, 'fatigue', (asleep ? -N.sleepRecovery : 1) + (shivering ? 1 : 0) + (ill >= 2 ? 1 : 0));
    // Wet and cold drift toward the weather where you are (step 17).
    if (e.Position && e.Needs.wet !== undefined) {
      const wetGoal = wetTarget(world, e) * N.perLevel.wet;
      const dryEvery = isIndoors(world, e.Position.x, e.Position.y) ? N.dryIndoors : N.dryOutdoors;
      if (e.Needs.wet < wetGoal) adjustNeed(world, e, 'wet', 1);
      else if (e.Needs.wet > wetGoal && t % dryEvery === 0) adjustNeed(world, e, 'wet', -1);
      const coldGoal = coldTarget(world, e) * N.perLevel.cold;
      if (e.Needs.cold < coldGoal) adjustNeed(world, e, 'cold', 1);
      else if (e.Needs.cold > coldGoal) adjustNeed(world, e, 'cold', -1);
    }
    const hunger = needLevel(e, 'hunger'), thirst = needLevel(e, 'thirst'), fatigue = needLevel(e, 'fatigue'), cold = needLevel(e, 'cold');
    if (asleep && cold === 3) wake(world, e, 'cold');
    if (cold === 3 && t % N.freezeEvery === 0) damage(world, e, 1, { cause: 'cold' });
    if (!world.entities.has(e.id)) continue;
    if (asleep && e.Needs.fatigue === 0) wake(world, e, 'rested');
    if (asleep && (hunger === 3 || thirst === 3)) wake(world, e, hunger === 3 ? 'hunger' : 'thirst');
    if (hunger === 3 && t % N.starveEvery === 0) damage(world, e, 1, { cause: 'starved' });
    if (!world.entities.has(e.id)) continue;
    if (thirst === 3 && t % N.parchedEvery === 0) damage(world, e, 1, { cause: 'thirst' });
    if (!world.entities.has(e.id) || !e.Health || e.Health.hp >= e.Health.max) continue;
    const bleeding = e.Bleeding && e.Bleeding.level > 0;
    const healEvery = asleep ? (hunger < 3 && thirst < 3 && !bleeding && ill < 2 ? N.sleepHealEvery : 0)
      : (hunger <= 1 && thirst <= 1 && fatigue <= 1 && !bleeding && !ill ? N.restHealEvery : 0);
    if (healEvery && t % healEvery === 0) {
      e.Health.hp++;
      world.events.emit('entity_healed', { id: e.id, hp: e.Health.hp, how: asleep ? 'sleep' : 'rest' });
    }
  }
}

// Eat or drink an item (food / drink ticks). Refused if it wouldn't help.
export function consumeFood(world, e, def) {
  if (!e.Needs) return true;
  const helps = (def.food && e.Needs.hunger > 0) || (def.drink && e.Needs.thirst > 0);
  if (!helps) return false;
  if (def.food) adjustNeed(world, e, 'hunger', -def.food);
  if (def.drink) adjustNeed(world, e, 'thirst', -def.drink);
  return true;
}

// Water you can drink from: on or next to a beck, the lake or a pond.
export function waterNearby(world, e, isWater) {
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const x = e.Position.x + dx, y = e.Position.y + dy;
    if (x >= 0 && y >= 0 && x < world.width && y < world.height && isWater(world.tiles[y * world.width + x])) return { x, y };
  }
  return null;
}

export { NEEDS };
