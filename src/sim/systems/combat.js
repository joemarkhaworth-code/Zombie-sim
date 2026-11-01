// Melee: any creature with Health can be attacked by any creature with Melee.
// attack() rolls to hit (seeded RNG), deals damage, may open a wound (bleeding),
// splashes blood, makes fighting noise, and kills at 0 health.
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

export function attack(world, attacker, target) {
  const m = attacker.Melee;
  if (!m || !target.Health) return false;
  const { x, y } = target.Position;
  makeNoise(world, x, y, CONFIG.melee.noise, attacker.id); // fights are loud
  if (!world.rng.chance(m.hitChance)) {
    world.events.emit('attack_missed', { id: attacker.id, targetId: target.id });
    return true;
  }
  world.events.emit('attack_hit', { id: attacker.id, targetId: target.id, damage: m.damage });
  addBlood(world, x, y, 1);
  if (world.rng.chance(m.woundChance)) wound(world, target);
  damage(world, target, m.damage, { killerId: attacker.id, cause: m.verb });
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
