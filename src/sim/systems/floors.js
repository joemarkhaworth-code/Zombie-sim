// Floors (step 14c): stairs and ladders join tiles on different floors.
//
// Every upstairs, cellar and loft is a small separate map: a walled pocket in a band of
// void below the valley (gen/floors.js). Void blocks movement, sight and sound, so each
// floor is its own world, but every system works there unchanged. The only ways between
// floors are links: a pair of Stairs entities, one standing on each floor, each pointing
// at the other.
//   Stairs { kind: 'stairs' | 'ladder', top, link, pulled }
//     top    - true for the upper end (upstairs, or the ground floor above a cellar)
//     link   - the other end's entity id
//     pulled - ladders only: pulled up from the top. Nobody can climb it from below,
//              and you must lower it before you climb down.
// Climbing takes a turn (stairs 1x, ladders 2x the time) and moves you to the other end
// (entity_climbed, then entity_moved, so sight, footsteps and memory all follow).
// Sound goes through links too (noise.js): you can be heard upstairs, and whoever hears
// it hears it coming from the stairs.
// world.links: tile index -> linked tile index; world.stairsAt: tile index -> entity id.
// Both are rebuilt from the entities (after a load, too).
import { CONFIG } from '../../config.js';
import { addEntity, blockerAt } from '../world.js';
import { makeNoise } from './noise.js';

const idxOf = (world, p) => p.y * world.width + p.x;

export function rebuildLinks(world) {
  world.links = new Map();
  world.stairsAt = new Map();
  for (const e of world.entities.values()) {
    if (!e.Stairs || !e.Position) continue;
    const other = world.entities.get(e.Stairs.link);
    world.stairsAt.set(idxOf(world, e.Position), e.id);
    if (other && other.Position) world.links.set(idxOf(world, e.Position), idxOf(world, other.Position));
  }
}

export function stairsAt(world, x, y) {
  const id = world.stairsAt && world.stairsAt.get(y * world.width + x);
  return id !== undefined ? world.entities.get(id) || null : null;
}

// Join a lower tile and an upper tile with stairs or a ladder.
export function makeStairs(world, lower, upper, kind) {
  const mk = (p, top) => addEntity(world, {
    Position: { x: p.x, y: p.y }, Stairs: { kind, top, link: null, pulled: false },
    Glyph: { char: '<', fg: '#000', bg: '#000' }, Name: { name: kind },
  });
  const lo = world.entities.get(mk(lower, false)), hi = world.entities.get(mk(upper, true));
  lo.Stairs.link = hi.id; hi.Stairs.link = lo.id;
  refreshStairs(lo); refreshStairs(hi);
  rebuildLinks(world);
  return [lo.id, hi.id];
}

// Glyph and name from state: stairs < (up) and > (down); a ladder H; a pulled-up ladder
// is a hatch overhead from below and a ladder lying on the floor from above.
export function refreshStairs(e) {
  const C = CONFIG.colours, s = e.Stairs;
  let char, name, fg = C.stairsText, bg = C.stairs;
  if (s.kind === 'stairs') { char = s.top ? '>' : '<'; name = s.top ? 'staircase down' : 'staircase up'; }
  else if (!s.pulled) { char = 'H'; name = s.top ? 'ladder down' : 'ladder up'; }
  else if (s.top) { char = '='; name = 'ladder, pulled up'; }
  else { char = '^'; name = 'hatch, out of reach'; fg = C.hatchText; bg = C.hatch; }
  e.Glyph = { char, fg, bg };
  e.Name = { name };
}

// Can e climb from where it stands? { to } or { reason: 'none' | 'pulled' | 'lower' | 'blocked' }.
export function climbCheck(world, e) {
  const s = stairsAt(world, e.Position.x, e.Position.y);
  if (!s) return { reason: 'none' };
  if (s.Stairs.kind === 'ladder' && s.Stairs.pulled) return { reason: s.Stairs.top ? 'lower' : 'pulled', stairs: s };
  const other = world.entities.get(s.Stairs.link);
  if (blockerAt(world, other.Position.x, other.Position.y)) return { reason: 'blocked', stairs: s };
  return { to: { ...other.Position }, stairs: s };
}

export function climb(world, e) {
  const c = climbCheck(world, e);
  if (!c.to) {
    if (c.reason !== 'none') world.events.emit('climb_blocked', { id: e.id, x: e.Position.x, y: e.Position.y, reason: c.reason });
    return false;
  }
  const from = { x: e.Position.x, y: e.Position.y }, kind = c.stairs.Stairs.kind;
  e.Position.x = c.to.x; e.Position.y = c.to.y;
  if (e.Actor) e.Actor.nextCost = CONFIG.scheduler.actionCost * (kind === 'ladder' ? CONFIG.floors.ladderCost : CONFIG.floors.stairsCost);
  world.events.emit('entity_climbed', { id: e.id, from, to: { ...c.to }, kind, up: !c.stairs.Stairs.top });
  world.events.emit('entity_moved', { id: e.id, from, to: { ...c.to } });
  return true;
}

// Pull up (up = true) or lower the ladder you're standing at the top of. Clatters.
export function setLadder(world, e, up) {
  const s = stairsAt(world, e.Position.x, e.Position.y);
  if (!s || s.Stairs.kind !== 'ladder' || !s.Stairs.top || s.Stairs.pulled === !!up) return false;
  const other = world.entities.get(s.Stairs.link);
  s.Stairs.pulled = other.Stairs.pulled = !!up;
  refreshStairs(s); refreshStairs(other);
  world.events.emit('ladder_moved', { id: e.id, x: e.Position.x, y: e.Position.y, up: !!up });
  makeNoise(world, e.Position.x, e.Position.y, CONFIG.floors.ladderNoise, e.id);
  return true;
}
