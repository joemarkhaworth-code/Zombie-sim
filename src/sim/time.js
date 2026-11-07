// The clock runs on scheduler ticks (world.tick), so slow actions take longer.
import { CONFIG } from '../config.js';

const minutesAt = tick => CONFIG.time.startHour * 60 + tick * CONFIG.time.minutesPerTick;

export function dayOf(tick) { return Math.floor(minutesAt(tick) / 1440) + 1; }

export function clockOf(tick) {
  const m = minutesAt(tick) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

// Full 24 hours since the start.
export function daysSurvived(tick) { return Math.floor(tick * CONFIG.time.minutesPerTick / 1440); }
