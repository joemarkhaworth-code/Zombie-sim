// Turns sim events into one short status-line message per turn.
// Lives on the render side: the sim never produces text. Pure JS (no DOM), so it's headless-testable.

import { canSee, visibilityAt } from '../sim/systems/vision.js';
import { CONFIG } from '../config.js';
import { dayOf, daysSurvived } from '../sim/time.js';
import { rememberedAt } from '../sim/systems/memory.js';
import { TILE_DESC, TILE_INFO } from '../sim/gen/testgrid.js';
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
  const itemName = (id) => world.entities.get(id)?.Name?.name ?? 'something';
  ev.on('item_picked_up', (d) => { if (isPlayer(d.id)) say(`You pick up the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
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
  ev.on('door_opened', (d) => { if (isPlayer(d.id)) say('You open the door.', PRIORITY.blocked); });
  ev.on('door_closed', (d) => { if (isPlayer(d.id)) say('You close the door.', PRIORITY.blocked); });
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
  ev.on('use_failed', (d) => {
    if (!isPlayer(d.id)) return;
    if (d.reason === 'nothing_to_barricade') say('Nothing here to board up.', PRIORITY.blocked);
    if (d.reason === 'no_door') say('No closed door by you.', PRIORITY.blocked);
  });
  ev.on('item_wielded', (d) => { if (isPlayer(d.id)) say(`You wield the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('item_unwielded', (d) => { if (isPlayer(d.id)) say(`You put away the ${itemName(d.itemId)}.`, PRIORITY.blocked); });
  ev.on('bleeding_started', (d) => { if (isPlayer(d.id)) say('You are bleeding!', PRIORITY.notice); });
  ev.on('bleeding_stopped', (d) => { if (isPlayer(d.id)) say('Your bleeding stops.', PRIORITY.info); });
  ev.on('entity_died', (d) => {
    if (isPlayer(d.killerId)) say(`You kill the ${d.name}.`, PRIORITY.notice);
  });
  ev.on('entity_waited', (d) => { if (isPlayer(d.id)) say('You wait.', PRIORITY.info); });
  ev.on('move_blocked', (d) => {
    if (!isPlayer(d.id)) return;
    if (d.blockerId === null) { say('A wall blocks the way.', PRIORITY.bump); return; }
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
      return TILE_INFO[tileAt(world, x, y)].cover ? `You, hidden in a ${TILE_INFO[tileAt(world, x, y)].name}.` : "That's you.";
    }
    const here = query(world, 'Position', 'Name').filter((e) => e.Position.x === x && e.Position.y === y);
    const creature = here.find((e) => e.Actor && canSee(world, player, e));
    if (creature) return `A ${creature.Name.name}.`;
    const thing = here.filter((e) => !e.Actor).pop();
    if (thing) return `A ${thing.Name.name}.`;
    if (world.blood && world.blood[y * world.width + x] && !TILE_INFO[tileAt(world, x, y)].opaque) return 'Blood on the ground.';
    if (world.glass && world.glass[y * world.width + x]) return 'Broken glass.';
    return TILE_DESC[tileAt(world, x, y)];
  }
  const snap = rememberedAt(world, player, x, y);
  if (!snap) return 'Unexplored.';
  const thing = snap.things[snap.things.length - 1];
  const what = thing ? `A ${thing.name}.` : snap.blood ? 'Blood on the ground.' : snap.glass ? 'Broken glass.' : TILE_DESC[snap.tile];
  return `${what.slice(0, -1)}, out of sight.`;
}

// Death page wording (Ceefax P302), from world.gameOver + world.stats.
const CAUSES = {
  bite: (k) => `Bitten by a ${k || 'zombie'}`,
  hit: (k) => `Beaten by a ${k || 'stranger'}`,
  bleeding: () => 'Bled out',
  shot: (k) => `Shot by a ${k || 'stranger'}`,
  thrown: (k) => `Hit by something ${k ? `a ${k} threw` : 'thrown'}`,
  shove: () => 'Slammed into a wall',
};
const HEADLINES = {
  bite: 'SURVIVOR BITTEN',
  bleeding: 'SURVIVOR BLEEDS OUT',
  shot: 'SURVIVOR SHOT DEAD',
};
export function deathText(world) {
  const g = world.gameOver;
  const cause = (CAUSES[g.cause] || (() => 'Died'))(g.killerName);
  return {
    page: 'P302',
    headline: HEADLINES[g.cause] || 'SURVIVOR FOUND DEAD',
    days: daysSurvived(g.turn),
    day: dayOf(g.turn),
    cause,
    kills: world.stats ? world.stats.kills : 0,
    turns: g.turn,
    seed: world.seed,
  };
}
