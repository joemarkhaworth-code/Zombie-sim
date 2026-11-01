// Melee: any creature with Health can be attacked by any creature with Melee.
// attack() rolls to hit (seeded RNG), deals damage, may open a wound (bleeding),
// splashes blood, makes fighting noise, and kills at 0 health.
// Sneak attack: if the target hadn't noticed the attacker, the hit always lands and
// deals bonus damage. Being attacked makes the target notice the attacker (a zombie
// then spends its next action reacting, so it can't strike back straight away).
//
// Components:
//   Health { hp, max }                 whole numbers, coarse
//   Melee  { damage, hitChance, woundChance, verb }  verb is data for the UI ('hit', 'bite')
// A dead creature is removed and leaves a corpse (a non-creature thing, so it's
// drawn, remembered and inspectable like any item).
import { CONFIG } from '../../config.js';
import { addEntity } from '../world.js';
import { makeNoise } from './noise.js';
import { addBlood, wound } from './bleeding.js';
import { canSee } from './vision.js';

// Had the target noticed the attacker before this attack?
//  - creatures with a Brain: only if they were tracking it on their last look;
//  - others (the player): if they can see the attacker now.
export function isAwareOf(world, target, attacker) {
  if (target.Brain) return !!(target.Brain.seesPrey && target.Brain.trackingId === attacker.id);
  return !!(target.Vision && canSee(world, target, attacker));
}

export function attack(world, attacker, target) {
  const m = attacker.Melee;
  if (!m || !target.Health) return false;
  const { x, y } = target.Position;
  const sneak = !isAwareOf(world, target, attacker);
  makeNoise(world, x, y, CONFIG.melee.noise, attacker.id); // fights are loud
  if (target.Brain) target.Brain.goal = { x: attacker.Position.x, y: attacker.Position.y, why: 'seen' }; // now it knows
  const hitChance = sneak ? CONFIG.melee.sneakAttackHitChance : m.hitChance;
  if (!world.rng.chance(hitChance)) {
    world.events.emit('attack_missed', { id: attacker.id, targetId: target.id });
    return true;
  }
  const dmg = m.damage + (sneak ? CONFIG.melee.sneakAttackBonus : 0);
  world.events.emit('attack_hit', { id: attacker.id, targetId: target.id, damage: dmg, sneak });
  addBlood(world, x, y, 1);
  if (world.rng.chance(m.woundChance)) wound(world, target);
  damage(world, target, dmg, { killerId: attacker.id, cause: m.verb });
  return true;
}

// Lose health. At 0 the creature dies.
export function damage(world, e, amount, { killerId = null, cause = 'unknown' } = {}) {
  if (!e.Health || !world.entities.has(e.id)) return;
  e.Health.hp = Math.max(0, e.Health.hp - amount);
  world.events.emit('entity_damaged', { id: e.id, amount, hp: e.Health.hp });
  if (e.Health.hp <= 0) kill(world, e, { killerId, cause });
}

export function kill(world, e, { killerId = null, cause = 'unknown' } = {}) {
  const { x, y } = e.Position;
  const name = e.Name ? e.Name.name : 'something';
  world.entities.delete(e.id);
  addBlood(world, x, y, 1);
  addEntity(world, {
    Position: { x, y },
    Glyph: { char: '%', fg: CONFIG.colours.corpseText, bg: CONFIG.colours.corpse },
    Name: { name: `${name} corpse` },
    Corpse: { of: name },
  });
  if (e.id === world.playerId) {
    world.gameOver = { cause, killerId, turn: world.turn, killerName: nameOf(world, killerId) };
    world.fallenPlayer = e; // removed from the world, but kept so the last view can still be drawn
  }
  world.events.emit('entity_died', { id: e.id, name, killerId, cause, x, y });
}

function nameOf(world, id) {
  const e = id !== null && world.entities.get(id);
  return e && e.Name ? e.Name.name : null;
}
