// Stealth: sneaking and cover.
//  - Sneaking (Stealth { sneaking }): moves cost more energy (slower), footsteps
//    drop to CONFIG.stealth.sneakFootsteps, and you're noticed from a shorter distance.
//  - Cover (tiles with cover, e.g. bushes): anything standing there can only be
//    noticed from an adjacent tile. Works for zombies hiding too.
// The noticing rule itself lives in vision.js canSee(), which reads these.
import { CONFIG } from '../../config.js';
import { inBounds, tileAt } from '../world.js';
import { TILE_INFO } from '../gen/testgrid.js';

export function setSneaking(world, e, on) {
  if (!e.Stealth || e.Stealth.sneaking === on) return false;
  e.Stealth.sneaking = on;
  if (e.Noisy) e.Noisy.move = on ? e.Stealth.sneakFootsteps : e.Stealth.walkFootsteps;
  world.events.emit('stance_changed', { id: e.id, sneaking: on });
  return true;
}

export function isSneaking(e) {
  return !!(e.Stealth && e.Stealth.sneaking);
}

export function inCover(world, x, y) {
  return inBounds(world, x, y) && TILE_INFO[tileAt(world, x, y)].cover;
}

// Energy cost of a move for this entity.
export function moveCost(e) {
  return CONFIG.scheduler.actionCost * (isSneaking(e) ? CONFIG.stealth.sneakMoveCost : 1);
}
