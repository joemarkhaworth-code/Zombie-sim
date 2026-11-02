// Tuning: a short list of CONFIG values that can be changed in-game (debug overlay ->
// TUNE). Pure sim code: main.js stores the overrides in localStorage and calls
// applyOverrides() at boot; syncWorld() pushes new values into entities that copied
// them at creation (zombie speed, bite, health, senses).
//
// Note: changing tuning mid-run changes how the sim behaves, so that run's recorded
// inputs no longer replay exactly. It's a balance tool, not part of play.
import { CONFIG } from '../config.js';
import { query } from './world.js';

export const TUNABLES = [
  { path: 'zombie.speed', label: 'Zombie speed', step: 10, min: 10, max: 200 },
  { path: 'zombie.melee.hitChance', label: 'Bite hit chance', step: 0.05, min: 0, max: 1, pct: true },
  { path: 'zombie.melee.damage', label: 'Bite damage', step: 1, min: 0, max: 6 },
  { path: 'zombie.melee.woundChance', label: 'Bite bleed chance', step: 0.05, min: 0, max: 1, pct: true },
  { path: 'zombie.health', label: 'Zombie health', step: 1, min: 1, max: 12 },
  { path: 'zombie.searchActions', label: 'Search length', step: 2, min: 0, max: 40 },
  { path: 'zombie.searchRadius', label: 'Search radius', step: 1, min: 0, max: 8 },
  { path: 'zombie.eyesight', label: 'Zombie eyesight', step: 1, min: 0, max: 3 },
  { path: 'zombie.hearing', label: 'Zombie hearing', step: 1, min: 0, max: 3 },
  { path: 'zombie.smell', label: 'Zombie smell', step: 1, min: 0, max: 3 },
  { path: 'light.range', label: 'Light range', step: 1, min: 1, max: 20 },
];

export function getPath(path) {
  return path.split('.').reduce((o, k) => o[k], CONFIG);
}
export function setPath(path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  keys.reduce((o, k) => o[k], CONFIG)[last] = value;
}

// Defaults as shipped in config.js (captured when this module first loads, before any
// overrides are applied).
const DEFAULTS = Object.fromEntries(TUNABLES.map((t) => [t.path, getPath(t.path)]));
export const defaultOf = (path) => DEFAULTS[path];

// Step a tunable up or down, clamped; returns the new value. Fixes float drift (0.85).
export function nudge(t, dir) {
  const v = Math.min(t.max, Math.max(t.min, getPath(t.path) + dir * t.step));
  const rounded = Math.round(v * 100) / 100;
  setPath(t.path, rounded);
  return rounded;
}

// overrides: { path: value } -> CONFIG. Unknown paths are ignored.
export function applyOverrides(overrides = {}) {
  for (const t of TUNABLES) {
    const v = overrides[t.path];
    if (typeof v === 'number' && Number.isFinite(v)) setPath(t.path, Math.min(t.max, Math.max(t.min, v)));
  }
}

// Current values that differ from the shipped defaults (what main.js saves).
export function currentOverrides() {
  const out = {};
  for (const t of TUNABLES) if (getPath(t.path) !== DEFAULTS[t.path]) out[t.path] = getPath(t.path);
  return out;
}

export function resetAll() {
  for (const t of TUNABLES) setPath(t.path, DEFAULTS[t.path]);
}

// Push zombie values into zombies already in the world (they copied them at creation).
export function syncWorld(world) {
  const Z = CONFIG.zombie;
  for (const z of query(world, 'Brain')) {
    if (z.Actor) z.Actor.speed = Z.speed;
    if (z.Melee) Object.assign(z.Melee, { damage: Z.melee.damage, hitChance: Z.melee.hitChance, woundChance: Z.melee.woundChance });
    if (z.Health) { z.Health.max = Z.health; z.Health.hp = Math.min(z.Health.hp, Z.health); }
    if (z.Vision) z.Vision.eyesight = Z.eyesight;
    if (z.Hearing) z.Hearing.level = Z.hearing;
    if (z.Smell) z.Smell.level = Z.smell;
  }
}
