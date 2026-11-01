// Game time. The clock runs on scheduler ticks, not player turns, so slow actions take
// longer: a normal step or wait is 1 tick, a sneaking step 2. Each tick is
// CONFIG.time.minutesPerTick minutes; a run starts on day 1 at CONFIG.time.startHour.
import { CONFIG } from '../config.js';

const DAY = 24 * 60;

// Minutes since midnight on day 1 at this tick.
export function minutesAt(tick) {
  return CONFIG.time.startHour * 60 + tick * CONFIG.time.minutesPerTick;
}

// The day you're on (starts at 1; rolls over at midnight).
export function dayOf(tick) {
  return Math.floor(minutesAt(tick) / DAY) + 1;
}

// Clock time "HH:MM".
export function clockOf(tick) {
  const m = minutesAt(tick) % DAY;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Whole days survived: full 24 hours since the run began.
export function daysSurvived(tick) {
  return Math.floor((tick * CONFIG.time.minutesPerTick) / DAY);
}
