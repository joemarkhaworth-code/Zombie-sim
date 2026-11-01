// Materials and structures: walls, doors, windows, barricades.
//
// Walls are tiles; their health comes from their material (world.tileHp, stone).
// Doors and windows are entities standing on a floor tile, indexed in world.structures
// (tile index -> entity id). Components:
//   Structure { material, hp, max }   health from CONFIG.materials[material].hp
//   Door { open, locked, broken }      closed: Blocks + Opaque. open/broken: neither.
//   Window { broken }                  intact: Blocks (see-through). broken: walk through.
//   Barricade { hp, max }              planks nailed over a door/window: soaks damage
//                                      first; blocks movement and sight while it lasts.
// Anything solid here also muffles noise like a wall (noise.js) and stops thrown items
// and shots (ranged.js).
//
// Bashing: damageStructure() - barricade first, then the structure. Each blow makes
// noise; glass breaking is loud and scatters broken glass (world.glass, tile state)
// that crunches (noise) when anything steps on it.
import { CONFIG } from '../../config.js';
import { addEntity, inBounds, isPassable } from '../world.js';
import { makeNoise } from './noise.js';

export function installStructures(world) {
  world.structures = new Map();
  world.glass = new Uint8Array(world.width * world.height); // broken glass level 0-3 per tile
  world.tileHp = new Uint16Array(world.width * world.height);
  // Crunch: anything stepping onto broken glass makes noise, sneaking or not.
  world.events.on('entity_moved', (d) => {
    const i = d.to.y * world.width + d.to.x;
    if (world.glass[i]) {
      world.events.emit('glass_crunched', { id: d.id, x: d.to.x, y: d.to.y });
      makeNoise(world, d.to.x, d.to.y, CONFIG.materials.glass.crunchNoise, d.id);
    }
  });
}

// Walls get their health from their material.
export function initTileHp(world, isWall) {
  for (let i = 0; i < world.tiles.length; i++) if (isWall(world.tiles[i])) world.tileHp[i] = CONFIG.materials.stone.hp;
}

export const structureAt = (world, x, y) => {
  if (!inBounds(world, x, y)) return null;
  const id = world.structures.get(y * world.width + x);
  return id !== undefined ? world.entities.get(id) || null : null;
};

function register(world, id, x, y) {
  world.structures.set(y * world.width + x, id);
  return id;
}

export function makeDoor(world, x, y, { material = 'wood', locked = false, open = false } = {}) {
  const hp = CONFIG.materials[material].hp;
  const id = addEntity(world, {
    Position: { x, y }, Structure: { material, hp, max: hp }, Door: { open, locked, broken: false },
    Glyph: { char: '+', fg: '#000', bg: '#000' }, Name: { name: 'door' },
  });
  refresh(world.entities.get(id));
  return register(world, id, x, y);
}

export function makeWindow(world, x, y, { material = 'glass' } = {}) {
  const hp = CONFIG.materials[material].hp;
  const id = addEntity(world, {
    Position: { x, y }, Structure: { material, hp, max: hp }, Window: { broken: false },
    Glyph: { char: '=', fg: '#000', bg: '#000' }, Name: { name: 'window' },
  });
  refresh(world.entities.get(id));
  return register(world, id, x, y);
}

// Recompute Blocks/Opaque, glyph and name from state. Call after any change.
export function refresh(e) {
  const C = CONFIG.colours;
  const barricaded = !!e.Barricade;
  let solid, opaque, char, fg, bg, name;
  if (e.Door) {
    const shut = !e.Door.open && !e.Door.broken;
    solid = shut || barricaded; opaque = shut || barricaded;
    char = e.Door.broken ? '/' : shut ? '+' : "'"; fg = C.doorText; bg = shut ? C.door : C.doorOpen;
    name = e.Door.broken ? 'broken door' : shut ? 'door' : 'open door';
  } else {
    solid = !e.Window.broken || barricaded; opaque = barricaded;
    char = e.Window.broken ? ',' : '='; fg = C.windowText; bg = e.Window.broken ? C.windowBroken : C.window;
    name = e.Window.broken ? 'broken window' : 'window';
  }
  if (barricaded) { char = '#'; fg = C.barricadeText; bg = C.barricade; name = `barricaded ${name}`; }
  if (solid) e.Blocks = {}; else delete e.Blocks;
  if (opaque) e.Opaque = {}; else delete e.Opaque;
  e.Glyph = { char, fg, bg };
  e.Name = { name };
}

// Open/close a door (not locked, not barricaded, not broken; closing needs the doorway clear).
export function toggleDoor(world, actor, door) {
  const d = door.Door;
  if (!d || d.broken || door.Barricade) return false;
  if (!d.open) {
    if (d.locked) { world.events.emit('door_locked', { id: actor.id, doorId: door.id }); return false; }
    d.open = true;
  } else {
    const { x, y } = door.Position;
    const occupied = [...world.entities.values()].some((e) => e.Actor && e.Position && e.Position.x === x && e.Position.y === y);
    if (occupied) { world.events.emit('door_blocked', { id: actor.id, doorId: door.id }); return false; }
    d.open = false;
  }
  refresh(door);
  world.events.emit(d.open ? 'door_opened' : 'door_closed', { id: actor.id, doorId: door.id });
  world.events.emit('structure_changed', { id: door.id });
  return true;
}

export function toggleLock(world, actor, door) {
  if (!door.Door || door.Door.open || door.Door.broken) return false;
  door.Door.locked = !door.Door.locked;
  world.events.emit(door.Door.locked ? 'door_lock' : 'door_unlock', { id: actor.id, doorId: door.id });
  return true;
}

// Is this structure in the way (something to bash rather than walk through)?
export function isObstacle(e) {
  return !!(e && e.Structure && e.Blocks);
}

// A blow against a structure. Barricade soaks it first. Returns true if it did anything.
export function damageStructure(world, e, amount, byId = null) {
  if (!isObstacle(e)) return false;
  const { x, y } = e.Position;
  const glass = e.Window && !e.Window.broken && !e.Barricade;
  makeNoise(world, x, y, glass ? CONFIG.materials.glass.breakNoise : CONFIG.materials.bashNoise, byId);
  if (e.Barricade) {
    e.Barricade.hp = Math.max(0, e.Barricade.hp - amount);
    world.events.emit('structure_damaged', { id: e.id, by: byId, part: 'barricade', hp: e.Barricade.hp });
    if (e.Barricade.hp <= 0) {
      delete e.Barricade;
      world.events.emit('barricade_broken', { id: e.id, by: byId });
    }
  } else {
    e.Structure.hp = Math.max(0, e.Structure.hp - amount);
    world.events.emit('structure_damaged', { id: e.id, by: byId, part: e.Door ? 'door' : 'window', hp: e.Structure.hp });
    if (e.Structure.hp <= 0) {
      if (e.Window) {
        e.Window.broken = true;
        scatterGlass(world, x, y);
        world.events.emit('window_smashed', { id: e.id, by: byId });
      } else {
        e.Door.broken = true;
        world.events.emit('door_broken', { id: e.id, by: byId });
      }
    }
  }
  refresh(e);
  world.events.emit('structure_changed', { id: e.id });
  return true;
}

function scatterGlass(world, x, y) {
  const add = (gx, gy) => { if (inBounds(world, gx, gy)) { const i = gy * world.width + gx; world.glass[i] = Math.min(3, world.glass[i] + 1); } };
  add(x, y);
  // a few shards on either side
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    if (isPassable(world, x + dx, y + dy) && world.rng.chance(0.5)) add(x + dx, y + dy);
  }
}

// Nail planks over a door or window. Returns true on success.
export function addBarricade(world, actor, e) {
  if (!e || !e.Structure || e.Barricade) return false;
  if (e.Door && e.Door.open && !e.Door.broken) return false; // close it first
  const occupied = [...world.entities.values()].some((c) => c.Actor && c.Position && c.Position.x === e.Position.x && c.Position.y === e.Position.y);
  if (occupied) return false;
  const hp = CONFIG.materials.planks.hp;
  e.Barricade = { hp, max: hp };
  refresh(e);
  makeNoise(world, e.Position.x, e.Position.y, CONFIG.materials.hammerNoise, actor.id); // hammering
  world.events.emit('barricade_built', { id: actor.id, structureId: e.id });
  world.events.emit('structure_changed', { id: e.id });
  return true;
}

// Adjacent structures to an actor, nearest-first in a fixed order (N, E, S, W, diagonals).
const ORDER = [[0, -1], [1, 0], [0, 1], [-1, 0], [1, -1], [1, 1], [-1, 1], [-1, -1]];
export function adjacentStructures(world, actor, filter = () => true) {
  const out = [];
  for (const [dx, dy] of ORDER) {
    const s = structureAt(world, actor.Position.x + dx, actor.Position.y + dy);
    if (s && filter(s)) out.push(s);
  }
  return out;
}
