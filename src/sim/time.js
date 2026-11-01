// Game time. A day is CONFIG.time.turnsPerDay player turns.
import { CONFIG } from '../config.js';

// The day you're on (starts at 1).
export function dayOf(turn) {
  return Math.floor(turn / CONFIG.time.turnsPerDay) + 1;
}

// Whole days survived so far (0 on the first day).
export function daysSurvived(turn) {
  return Math.floor(turn / CONFIG.time.turnsPerDay);
}
