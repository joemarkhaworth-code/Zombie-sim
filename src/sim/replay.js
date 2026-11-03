// Replays (step 21): a run rebuilt from its seed and recorded inputs, step by step.
//
// world.inputs holds every input in order: { turn, action } for player actions (turn.js
// records them) and { turn, debug } for the TUNE panel's world changes (weather, time,
// give, beck, ice), which go through applyDebug() so they're recorded too. Replaying is
// just createWorld(seed) and applying the same list, so the run plays out exactly as it
// did (seeded RNG). Changing tuning numbers (CONFIG) mid-run is not recorded: such a run
// may not replay exactly.
import { CONFIG } from '../config.js';
import { playerAct } from './turn.js';
import { setWeather } from './systems/weather.js';
import { setWaterLevel } from './systems/water.js';
import { updateLight } from './systems/light.js';
import { makeItem, usedSlots } from './systems/items.js';

// A TUNE-panel world change, applied and recorded. d: { kind: 'weather', to } |
// { kind: 'time', hours } | { kind: 'give', type } | { kind: 'water', what, level }.
// Returns what happened (for the UI): for give, 'bag' or 'floor'.
export function applyDebug(world, d) {
  world.inputs.push({ turn: world.turn, debug: d });
  let out = null;
  if (d.kind === 'weather') setWeather(world, d.to);
  else if (d.kind === 'time') world.tick = Math.max(0, world.tick + d.hours * 60 / CONFIG.time.minutesPerTick);
  else if (d.kind === 'water') setWaterLevel(world, d.what, d.level);
  else if (d.kind === 'give') {
    const p = world.entities.get(world.playerId);
    const id = makeItem(world, d.type, p.Position.x, p.Position.y);
    if (usedSlots(world, p) + CONFIG.items[d.type].slots <= p.Inventory.capacity) { delete world.entities.get(id).Position; p.Inventory.items.push(id); out = 'bag'; } else out = 'floor';
  }
  updateLight(world, true);
  return out;
}

// Apply one recorded input.
export function applyInput(world, rec) {
  if (rec.debug) applyDebug(world, rec.debug);
  else playerAct(world, rec.action);
}

// A replay you can step through: { world, step(n), done, index, total }.
export function createReplay(createWorld, { seed, map, inputs }) {
  const world = createWorld(seed, { map });
  let i = 0;
  return {
    world,
    total: inputs.length,
    get index() { return i; },
    get done() { return i >= inputs.length; },
    step(n = 1) { for (let k = 0; k < n && i < inputs.length; k++) applyInput(world, inputs[i++]); },
  };
}
