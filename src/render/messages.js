// Turns sim events into one short status-line message per turn.
// Lives on the render side: the sim never produces text. Pure JS (no DOM), so it's headless-testable.

import { canSee, visibilityAt } from '../sim/systems/vision.js';
import { CONFIG } from '../config.js';
import { needLevel } from '../sim/systems/needs.js';
import { trackAt } from '../sim/systems/tracks.js';
import { iceLevel } from '../sim/systems/water.js';
import { dayOf, daysSurvived, clockOf } from '../sim/time.js';
import { rememberedAt } from '../sim/systems/memory.js';
import { TILE_DESC, TILE_INFO, TILE } from '../sim/gen/testgrid.js';
import { inBounds, tileAt, query } from '../sim/world.js';

const cheb = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

// Priority: higher replaces lower within the same turn. Danger always wins.
export const PRIORITY = { info: 0, bump: 1, blocked: 2, notice: 3, danger: 4 };

// onScreen(x, y): is this tile currently on the player's screen? The sim can see
// further than the screen is wide, so "comes into view" only counts what's on screen.
// Defaults to always true (headless).
export function createMessageLog(world, { onScreen = () => true } = {}) {
  let current = null;            // { text, priority }
  let adjacentLastTurn = new Set();
  let inViewLastTurn = new Set();

  const say = (text, priority) => {
    if (!current || priority >= current.priority) current = { text, priority };
  };
  const name = (id) => world.entities.get(id)?.Name?.name ?? 'something';
  const isPlayer = (id) => id === world.playerId;
  const playerSeesTile = (x, y) => { const p = world.entities.get(world.playerId); return !!(p && visibilityAt(world, p, x, y) > 0 && onScreen(x, y)); };
  const VERB_S = { bite: 'bites', hit: 'hits' };
  const verbs = (id) => VERB_S[world.entities.get(id)?.Melee?.verb] || 'hits';
  const adjacentActors = () => {
    const p = world.entities.get(world.playerId);
    const out = new Set();
    if (!p) return out;
    for (const e of world.entities.values()) {
      if (e.id !== p.id && e.Actor && e.Position && cheb(e.Position, p.Position) <= 1) out.add(e.id);
    }
    return out;
  };

  const ev = world.events;
  ev.on('action_attempted', (d) => { if (isPlayer(d.id)) current = null; }); // new action clears the line
  ev.on('stance_changed', (d) => {
    if (isPlayer(d.id)) current = { text: d.sneaking ? 'You start sneaking.' : 'You stop sneaking.', priority: PRIORITY.info };
  });
  ev.on('attack_hit', (d) => {
    if (isPlayer(d.id)) say(d.sneak ? 'Sneak attack!' : `You hit the ${name(d.targetId)}.`, d.sneak ? PRIORITY.notice : PRIORITY.blocked);
    else if (isPlayer(d.targetId)) say(`The ${name(d.id)} ${verbs(d.id)} you!`, PRIORITY.danger);
  });
  ev.on('attack_missed', (d) => {
    if (isPlayer(d.id)) say(`You miss the ${name(d.targetId)}.`, PRIORITY.blocked);
    else if (isPlayer(d.targetId)) say(`The ${name(d.id)} misses you.`, PRIORITY.notice);
  });
  ev.on('entity_shoved', (d) => {
    if (isPlayer(d.by)) say(`You shove the ${name(d.id)}.`, PRIORITY.blocked);
  });
  ev.on('entity_slammed', (d) => {
    const into = d.blockerId !== null ? `the ${name(d.blockerId)}` : 'the wall';
    if (isPlayer(d.id)) say(`You slam into ${into}!`, PRIORITY.danger);
    else if (playerCanSee(d.id)) say(`The ${name(d.id)} slams into ${into}!`, PRIORITY.notice);
  });
  const CONFIG_NOISY = (itemId) => { const t = world.entities.get(itemId)?.Item?.type; return t && CONFIG.items[t].ranged.noise >= 3; };
  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);
  const itemName = (id) => world.entities.get(id)?.Name?.name ?? 'something';
  ev.on('item_picked_up', (d) => { if (isPlayer(d.id)) say(d.keyring ? `${cap(itemName(d.itemId))} on your keyring.` : `You pick up the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('pickup_failed', (d) => { if (isPlayer(d.id)) say('Your bag is full.', PRIORITY.blocked); });
  ev.on('item_dropped', (d) => { if (isPlayer(d.id)) say(`You drop the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('item_used', (d) => {
    if (!isPlayer(d.id)) return;
    say(d.how === 'bandaged' ? 'You bandage your wounds.' : `You eat the ${d.name}.`, PRIORITY.blocked);
  });
  ev.on('use_failed', (d) => { if (isPlayer(d.id) && d.reason === 'not_bleeding') say("You're not bleeding.", PRIORITY.blocked); });
  ev.on('item_thrown', (d) => { if (isPlayer(d.id)) say(`You throw the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('thrown_hit', (d) => {
    if (isPlayer(d.id)) say(d.heavy ? `It hits the ${name(d.targetId)}!` : `The ${name(d.targetId)} staggers!`, PRIORITY.notice);
  });
  ev.on('shot_fired', (d) => { if (isPlayer(d.id)) say(CONFIG_NOISY(d.itemId) ? 'BANG!' : 'Pfft.', PRIORITY.blocked); });
  ev.on('shot_hit', (d) => { if (isPlayer(d.id)) say(`You shoot the ${name(d.targetId)}!`, PRIORITY.notice); });
  ev.on('shot_missed', (d) => { if (isPlayer(d.id)) say('You miss.', PRIORITY.notice); });
  ev.on('fire_failed', (d) => { if (isPlayer(d.id) && d.reason === 'empty') say('Click. Out of ammo.', PRIORITY.blocked); });
  // Doors, windows, barricades.
  const heardFrom = new Set(); // sources the player heard this turn (for "something bangs")
  ev.on('action_attempted', (d) => { if (isPlayer(d.id)) heardFrom.clear(); });
  ev.on('noise_heard', (d) => { if (isPlayer(d.id) && d.sourceId !== null) heardFrom.add(d.sourceId); });
  const thingName = (id) => world.entities.get(id)?.Name?.name ?? 'something';
  ev.on('door_opened', (d) => { if (isPlayer(d.id)) say(d.unlocked ? 'You unlock and open the door.' : 'You open the door.', PRIORITY.blocked); });
  ev.on('door_closed', (d) => { if (isPlayer(d.id)) say(d.locked ? 'You close and lock the door.' : 'You close the door.', PRIORITY.blocked); });
  ev.on('door_locked', (d) => { if (isPlayer(d.id)) say('The door is locked.', PRIORITY.blocked); });
  ev.on('door_blocked', (d) => { if (isPlayer(d.id)) say('Something is in the way.', PRIORITY.blocked); });
  ev.on('door_lock', (d) => { if (isPlayer(d.id)) say('You lock the door.', PRIORITY.blocked); });
  ev.on('door_unlock', (d) => { if (isPlayer(d.id)) say('You unlock the door.', PRIORITY.blocked); });
  ev.on('barricade_built', (d) => { if (isPlayer(d.id)) say(`You board up the ${thingName(d.structureId).replace('barricaded ', '')}.`, PRIORITY.blocked); });
  ev.on('structure_damaged', (d) => {
    const what = d.part === 'barricade' ? 'barricade' : d.part;
    if (isPlayer(d.by)) {
      if (d.part !== 'window') say(`You bash the ${what}.`, PRIORITY.blocked);
      return;
    }
    const by = world.entities.get(d.by);
    if (by && playerCanSee(d.by)) say(`The ${name(d.by)} bashes the ${what}!`, PRIORITY.danger);
    else if (heardFrom.has(d.by)) say(`Something bangs on a ${what}!`, PRIORITY.danger);
  });
  ev.on('window_smashed', (d) => { if (isPlayer(d.by)) say('You smash the window!', PRIORITY.notice); else if (heardFrom.has(d.by) || playerCanSee(d.by)) say('Glass shatters!', PRIORITY.danger); });
  ev.on('door_broken', (d) => { if (isPlayer(d.by)) say('The door gives way!', PRIORITY.notice); else say('A door gives way!', PRIORITY.danger); });
  ev.on('barricade_broken', (d) => { if (!isPlayer(d.by)) say('A barricade gives way!', PRIORITY.danger); });
  ev.on('glass_crunched', (d) => { if (isPlayer(d.id)) say('Glass crunches underfoot.', PRIORITY.info); });
  ev.on('ground_noise', (d) => {
    if (!isPlayer(d.id)) return;
    const t = { [TILE.STREAM]: 'You splash through the beck.', [TILE.HEDGE]: 'You push through the hedge.', [TILE.BRACKEN]: 'Bracken rustles.', [TILE.SCREE]: 'Scree clatters underfoot.', [TILE.SHORE]: 'Shingle crunches.', [TILE.GATE]: 'The gate creaks.', [TILE.ICE]: 'The ice creaks.', [TILE.FLOODWATER]: 'You wade through floodwater.', [TILE.FLOOD_IN]: 'You wade through floodwater.', [TILE.FALLEN_TREE]: 'You clamber over the tree.', [TILE.SILT]: 'Silt squelches underfoot.', [TILE.SILT_FLOOR]: 'Silt squelches underfoot.', [TILE.RUBBLE]: 'Rubble shifts underfoot.' }[d.tile];
    say(t || 'Noisy ground.', PRIORITY.info);
  });
  ev.on('use_failed', (d) => {
    if (!isPlayer(d.id)) return;
    if (d.reason === 'nothing_to_barricade') say('Nothing here to board up.', PRIORITY.blocked);
    if (d.reason === 'no_gun') say('No gun to load.', PRIORITY.blocked);
    if (d.reason === 'spent') say("It's spent.", PRIORITY.blocked);
    if (d.reason === 'not_hungry') say("You're not hungry.", PRIORITY.blocked);
    if (d.reason === 'not_thirsty') say("You're not thirsty.", PRIORITY.blocked);
    if (d.reason === 'not_tired') say("You're not tired.", PRIORITY.blocked);
    if (d.reason === 'no_water') say('No water here.', PRIORITY.blocked);
    if (d.reason === 'not_safe') say('Not with them about.', PRIORITY.blocked);
    if (d.reason === 'too_cold') say('Too cold to sleep.', PRIORITY.blocked);
    if (d.reason === 'nothing_burns') say('Nothing here will burn.', PRIORITY.blocked);
    if (d.reason === 'not_hurt') say("You're not hurt.", PRIORITY.blocked);
  });
  // Needs (step 16).
  const NEED_WORDS = {
    hunger: [null, "You're getting hungry.", "You're hungry.", "You're starving!"],
    thirst: [null, "You're thirsty.", "You're very thirsty.", "You're parched!"],
    fatigue: [null, "You're tired.", "You're very tired.", "You're exhausted!"],
    wet: [null, "You're getting wet.", "You're soaked.", "You're drenched!"],
    cold: [null, 'You feel cold.', "You're shivering.", "You're freezing!"],
    ill: [null, 'You feel sick.', "You're ill.", "You're very ill!"],
  };
  ev.on('need_changed', (d) => {
    if (isPlayer(d.id) && d.need === 'ill' && d.level === 0 && d.from > 0) { say('You feel better.', PRIORITY.notice); return; }
    if (!isPlayer(d.id) || d.level <= d.from) return; // only say it when it gets worse
    say(NEED_WORDS[d.need][d.level], d.level >= 3 ? PRIORITY.danger : PRIORITY.notice);
  });
  ev.on('drank', (d) => { if (isPlayer(d.id)) say('You drink from the water.', PRIORITY.info); });
  ev.on('fell_asleep', (d) => { if (isPlayer(d.id)) say('You fall asleep.', PRIORITY.info); });
  ev.on('woke', (d) => {
    if (!isPlayer(d.id)) return;
    const t = { rested: ['You wake, rested.', PRIORITY.info], noise: ['A noise wakes you!', PRIORITY.danger], hurt: ['You wake in pain!', PRIORITY.danger], hunger: ['Hunger wakes you.', PRIORITY.notice], thirst: ['Thirst wakes you.', PRIORITY.notice], cold: ['The cold wakes you.', PRIORITY.notice] }[d.reason] || ['You wake.', PRIORITY.info];
    say(t[0], t[1]);
  });
  // Fire (step 19).
  ev.on('fire_lit', (d) => { if (isPlayer(d.id)) say('You start a fire.', PRIORITY.notice); });
  ev.on('fire_started', (d) => { if (!isPlayer(d.by) && playerSeesTile(d.x, d.y)) say('Fire!', PRIORITY.danger); });
  ev.on('entity_burned', (d) => { if (isPlayer(d.id)) say("You're burning!", PRIORITY.danger); });
  ev.on('coughed', (d) => { if (isPlayer(d.id)) say('You choke on the smoke.', PRIORITY.danger); });
  ev.on('explosion', (d) => say(playerSeesTile(d.x, d.y) ? 'BOOM!' : 'An explosion!', PRIORITY.danger));
  ev.on('petrol_spilled', () => say('Petrol splashes about.', PRIORITY.info));
  // Water (step 20).
  ev.on('beck_changed', (d) => {
    const t = d.to === 3 ? ['The beck floods its banks!', PRIORITY.danger] : d.to === 2 && d.from < 2 ? ['The beck is in spate.', PRIORITY.notice]
      : d.to === 2 ? ['The flood leaves silt.', PRIORITY.info] : d.from >= 2 ? ['The beck goes down.', PRIORITY.info] : null;
    if (t) say(t[0], t[1]);
  });
  ev.on('bridge_washed_away', (d) => say(playerSeesTile(d.x, d.y) ? `The ${d.kind} is swept away!` : 'A crash from the beck.', PRIORITY.danger));
  ev.on('swept', (d) => { if (isPlayer(d.id)) say('The beck sweeps you away!', PRIORITY.danger); });
  ev.on('ice_changed', (d) => { if (d.from === 0) say('The lake freezes over.', PRIORITY.notice); else if (d.to === 0) say('The ice melts.', PRIORITY.notice); });
  ev.on('ice_broke', (d) => { if (playerSeesTile(d.x, d.y)) say('The ice cracks!', PRIORITY.danger); });
  ev.on('fell_through_ice', (d) => {
    if (isPlayer(d.id)) say('You fall through the ice!', PRIORITY.danger);
    else if (playerSeesTile(d.x, d.y)) say(`The ${world.entities.get(d.id)?.Name?.name || 'thing'} goes under.`, PRIORITY.notice);
  });
  // Storms and flood damage.
  const player = () => world.entities.get(world.playerId);
  const near = (x, y, r) => { const p = player(); return p && p.Position && Math.max(Math.abs(p.Position.x - x), Math.abs(p.Position.y - y)) <= r; };
  ev.on('tree_fell', (d) => { if (playerSeesTile(d.x, d.y)) say('A tree comes down!', PRIORITY.danger); else if (near(d.x, d.y, 12)) say('A crash in the wind.', PRIORITY.notice); });
  ev.on('crushed', (d) => { if (isPlayer(d.id)) say('A tree knocks you flat!', PRIORITY.danger); });
  ev.on('roof_damaged', (d) => { if (playerSeesTile(d.x, d.y) || near(d.x, d.y, 6)) say('Slates crash down.', PRIORITY.notice); });
  ev.on('pane_blown', (d) => { if (playerSeesTile(d.x, d.y)) say('Glass shatters.', PRIORITY.notice); });
  ev.on('flood_spread', () => say('The flood spreads.', PRIORITY.notice));
  ev.on('wall_breached', (d) => { if (playerSeesTile(d.x, d.y)) say('A wall gives way.', PRIORITY.notice); });
  ev.on('vomited', (d) => { if (isPlayer(d.id)) say('You throw up.', PRIORITY.notice); });
  ev.on('item_used_up', (d) => { if (isPlayer(d.id)) say(`That's the last of the ${d.name}.`, PRIORITY.info); });
  // Weather (step 17).
  ev.on('weather_changed', (d) => {
    const t = {
      clear: 'The sky clears.', overcast: d.from === 'clear' ? 'Clouds roll in.' : ['rain', 'heavyRain', 'snow'].includes(d.from) ? 'It stops.' : 'The fog lifts.',
      rain: d.from === 'heavyRain' ? 'The rain eases.' : 'It starts to rain.', heavyRain: 'The rain pours down.',
      fog: 'Fog rolls in.', snow: 'It starts to snow.', gale: 'A gale blows up!',
    }[d.to];
    if (d.from === 'gale' && d.to !== 'gale') { say('The wind drops.', PRIORITY.notice); return; }
    if (t) say(t, PRIORITY.notice);
  });
  ev.on('snow_settled', () => say('Snow settles.', PRIORITY.info));
  ev.on('snow_melted', () => say('The snow melts away.', PRIORITY.info));
  // Light (step 15).
  ev.on('ambient_changed', (d) => {
    if (d.to < d.from && d.to <= 1) say('Night falls.', PRIORITY.notice);
    else if (d.to < d.from) say("It's getting dark.", PRIORITY.info);
    else if (d.from <= 1) say('Dawn breaks.', PRIORITY.info);
  });
  ev.on('light_on', (d) => { if (isPlayer(d.id)) say(`You light the ${itemName(d.itemId)}.`, PRIORITY.info); });
  ev.on('light_off', (d) => { if (isPlayer(d.id)) say(`You put out the ${itemName(d.itemId)}.`, PRIORITY.info); });
  ev.on('light_out', (d) => { if (isPlayer(d.holderId)) say(d.burnsOut ? `Your ${d.name} burns out.` : `Your ${d.name} dies.`, PRIORITY.notice); });
  ev.on('gun_loaded', (d) => { if (isPlayer(d.id)) say(`Loaded. ${d.ammo} rounds.`, PRIORITY.info); });
  ev.on('item_wielded', (d) => { if (isPlayer(d.id)) say(`You wield the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('item_unwielded', (d) => { if (isPlayer(d.id)) say(`You put away the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('bleeding_started', (d) => { if (isPlayer(d.id)) say('You are bleeding!', PRIORITY.notice); });
  ev.on('bleeding_stopped', (d) => { if (isPlayer(d.id)) say('Your bleeding stops.', PRIORITY.info); });
  ev.on('entity_died', (d) => {
    if (isPlayer(d.killerId)) say(`You kill the ${d.name}.`, PRIORITY.notice);
  });
  ev.on('entity_waited', (d) => { if (isPlayer(d.id)) say('You wait.', PRIORITY.info); });
  // Stairs and ladders (step 14c).
  ev.on('entity_climbed', (d) => {
    if (!isPlayer(d.id)) return;
    say(d.kind === 'ladder' ? (d.up ? 'You climb up the ladder.' : 'You climb down the ladder.') : d.up ? 'You go up the stairs.' : 'You go down the stairs.', PRIORITY.info);
  });
  ev.on('climb_blocked', (d) => {
    if (!isPlayer(d.id)) return;
    say({ pulled: "The ladder's pulled up.", lower: 'Lower the ladder first.', blocked: "Something's in the way." }[d.reason] || "You can't.", PRIORITY.blocked);
  });
  ev.on('ladder_moved', (d) => { if (isPlayer(d.id)) say(d.up ? 'You pull the ladder up.' : 'You lower the ladder.', PRIORITY.info); });
  ev.on('entity_moved', (d) => { // stepping onto stairs: say what's here (the button appears)
    if (!isPlayer(d.id) || !world.stairsAt) return;
    const id = world.stairsAt.get(d.to.y * world.width + d.to.x);
    if (id !== undefined && world.entities.get(id)) say(`A ${world.entities.get(id).Name.name}.`, PRIORITY.info);
  });
  ev.on('move_blocked', (d) => {
    if (!isPlayer(d.id)) return;
    if (d.blockerId === null) {
      const t = inBounds(world, d.x, d.y) ? tileAt(world, d.x, d.y) : TILE.WALL;
      say(t === TILE.POND ? 'The pond is too deep.' : t === TILE.LAKE ? 'The lake is too deep.' : t === TILE.ROCK ? 'Rock blocks the way.' : `A ${TILE_INFO[t].name} blocks the way.`, PRIORITY.bump);
      return;
    }
    const st = world.entities.get(d.blockerId);
    if (st && st.Structure) { // hint how to break it on purpose
      say(st.Barricade ? 'Boarded up. Tap it to bash.' : st.Window ? 'Tap the window to smash it.' : 'Locked. Tap it to bash it.', PRIORITY.blocked);
      return;
    }
    else say(`The ${name(d.blockerId)} is in the way.`, PRIORITY.blocked);
  });
  const playerCanSee = (id) => {
    const p = world.entities.get(world.playerId), e = world.entities.get(id);
    return !!(p && e && canSee(world, p, e) && onScreen(e.Position.x, e.Position.y));
  };
  const actorsInView = () => {
    const out = new Set();
    for (const e of world.entities.values()) {
      if (e.Actor && e.Position && !isPlayer(e.id) && playerCanSee(e.id)) out.add(e.id);
    }
    return out;
  };
  // Only report a zombie noticing you if you can see it happen.
  ev.on('prey_spotted', (d) => {
    if (isPlayer(d.preyId) && playerCanSee(d.id)) say(`The ${name(d.id)} has seen you!`, PRIORITY.danger);
  });
  ev.on('turn_ended', () => {
    const inView = actorsInView();
    for (const id of inView) {
      if (!inViewLastTurn.has(id)) { say(`A ${name(id)} comes into view.`, PRIORITY.notice); break; }
    }
    inViewLastTurn = inView;
    const now = adjacentActors();
    for (const id of now) {
      if (!adjacentLastTurn.has(id)) { say(`The ${name(id)} is next to you!`, PRIORITY.danger); break; }
    }
    adjacentLastTurn = now;
  });

  return {
    get message() { return current; },
    // Show text right now (e.g. inspect). Cleared by the next action like any message.
    show(text, priority = PRIORITY.info) { current = { text, priority }; },
  };
}

// Long-press inspect: a one-line description of what the player knows about (x, y).
//  - In sight: a creature standing there (if noticed), else the top thing on the
//    tile (item, door...), else the terrain. All live.
//  - Out of sight but remembered: the snapshot from when it was last seen, never
//    the live tile, and never creatures.
//  - Never seen: unexplored.
export function describeTile(world, x, y) {
  const player = world.entities.get(world.playerId);
  if (!player || !inBounds(world, x, y)) return 'Nothing there.';
  if (visibilityAt(world, player, x, y) > 0) {
    if (x === player.Position.x && y === player.Position.y) {
      const under = query(world, 'Item', 'Position').filter((e) => e.Position.x === x && e.Position.y === y).pop();
      if (under) return `You're on a ${under.Name.name}.`;
      const how = [['hunger', ['', 'peckish', 'hungry', 'starving']], ['thirst', ['', 'thirsty', 'very thirsty', 'parched']], ['fatigue', ['', 'tired', 'very tired', 'exhausted']], ['wet', ['', 'damp', 'soaked', 'drenched']], ['cold', ['', 'cold', 'shivering', 'freezing']], ['ill', ['', 'sick', 'ill', 'very ill']]]
        .map(([n, words]) => words[needLevel(player, n)]).filter(Boolean);
      if (how.length) return `You: ${how.join(', ')}.`;
      return TILE_INFO[tileAt(world, x, y)].cover ? `You, hidden in a ${TILE_INFO[tileAt(world, x, y)].name}.` : "That's you.";
    }
    const here = query(world, 'Position', 'Name').filter((e) => e.Position.x === x && e.Position.y === y);
    const creature = here.find((e) => e.Actor && canSee(world, player, e));
    if (creature) return `A ${creature.Name.name}.`;
    const thing = here.filter((e) => !e.Actor).pop();
    if (thing) return `A ${thing.Name.name}.`;
    if (world.blood && world.blood[y * world.width + x] && !TILE_INFO[tileAt(world, x, y)].opaque) return 'Blood on the ground.';
    if (world.glass && world.glass[y * world.width + x]) return 'Broken glass.';
    const tr = trackAt(world, x, y);
    if (tr) return trackText(tr);
    if (tileAt(world, x, y) === TILE.ICE) return ['Ice.', 'Thin ice.', 'Ice.', 'Thick ice.'][iceLevel(world)];
    return TILE_DESC[tileAt(world, x, y)];
  }
  const snap = rememberedAt(world, player, x, y);
  if (!snap) return 'Unexplored.';
  const thing = snap.things[snap.things.length - 1];
  const what = thing ? `A ${thing.name}.` : snap.blood ? 'Blood on the ground.' : snap.glass ? 'Broken glass.' : snap.track ? trackText(snap.track) : TILE_DESC[snap.tile];
  return `${what.slice(0, -1)}, out of sight.`;
}

// Prints (step 18): "Footprints in the snow.", "Zombie tracks in the mud."
const trackText = (tr) => `${tr.mark === 'boots' ? 'Footprints' : 'Zombie tracks'} in the ${tr.in}.`;

// Death screen wording, from world.gameOver + world.stats.
const CAUSES = {
  bite: (k) => `Bitten by a ${k || 'zombie'}`,
  hit: (k) => `Beaten by a ${k || 'stranger'}`,
  bleeding: () => 'Bled out',
  shot: (k) => `Shot by a ${k || 'stranger'}`,
  thrown: (k) => `Hit by something ${k ? `a ${k} threw` : 'thrown'}`,
  shove: () => 'Slammed into a wall',
  starved: () => 'Starved to death',
  thirst: () => 'Died of thirst',
  cold: () => 'Died of cold',
  fire: () => 'Burned to death',
  explosion: () => 'Blown up',
  smoke: () => 'Choked on smoke',
  drowned: () => 'Drowned',
  illness: () => 'Died of a fever',
};
export function deathText(world) {
  const g = world.gameOver;
  const cause = (CAUSES[g.cause] || (() => 'Died'))(g.killerName);
  return {
    days: daysSurvived(g.tick),
    day: dayOf(g.tick),
    clock: clockOf(g.tick),
    cause,
    kills: world.stats ? world.stats.kills : 0,
    turns: g.turn,
    seed: world.seed,
  };
}
