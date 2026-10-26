import type { Energy, Occurrence, Task } from '@/lib/types';
import { MIN } from '@/lib/dates';

export interface PlanOptions {
  /** Midnight of the day being planned. */
  day: Date;
  /** Don't schedule before this time (e.g. now, when planning today). */
  notBefore?: number;
  dayStartMin?: number; // default 9:00
  dayEndMin?: number; // default 21:00
  bufferMin?: number; // gap kept between blocks
  /** 24 weights in 0–1: how productive each hour of the day tends to be. */
  productivity?: number[];
}

export interface PlanResult {
  scheduled: { taskId: string; start: number; end: number }[];
  unscheduled: string[];
}

const SLOT = 15;

/** A default energy curve: sharp mornings, post-lunch dip, second wind late afternoon. */
export const DEFAULT_PRODUCTIVITY = [
  0, 0, 0, 0, 0, 0, 0.2, 0.45, 0.75, 0.95, 1, 0.9, 0.6, 0.45, 0.55, 0.7, 0.75, 0.6, 0.45, 0.35, 0.3, 0.2, 0.1, 0,
];

/** Learns which hours the user actually gets things done, from completions and focus sessions. */
export function productivityFromHistory(doneTimes: number[], focus: { start: number; minutes: number }[]): number[] {
  const counts = new Array(24).fill(0);
  for (const t of doneTimes) counts[new Date(t).getHours()] += 1;
  for (const f of focus) counts[new Date(f.start).getHours()] += f.minutes / 25;
  const total = counts.reduce((a, b) => a + b, 0);
  if (total < 12) return DEFAULT_PRODUCTIVITY;
  const max = Math.max(...counts);
  // Blend with the default so sparse hours don't drop to zero.
  return counts.map((c, h) => 0.65 * (c / max) + 0.35 * DEFAULT_PRODUCTIVITY[h]);
}

export function taskUrgency(t: Task, dayKey: string) {
  let s = t.priority * 100;
  if (t.top) s += 150;
  if (t.due && t.due < dayKey) s += 80;
  else if (t.due === dayKey) s += 50;
  if (t.status === 'today') s += 30;
  return s;
}

function energyFit(energy: Energy | undefined, weight: number) {
  if (energy === 'high') return weight;
  if (energy === 'low') return 1 - weight;
  return 0.5 + (weight - 0.5) * 0.3;
}

/**
 * Time-blocks tasks into the free gaps of a day, most urgent first. High-energy work goes
 * to the user's productive hours, low-energy work to the slumps; earlier slots win ties.
 */
export function planDay(tasks: Task[], busy: Pick<Occurrence, 'start' | 'end'>[], opts: PlanOptions): PlanResult {
  const day0 = new Date(opts.day);
  day0.setHours(0, 0, 0, 0);
  const base = day0.getTime();
  const dayKey = `${day0.getFullYear()}-${String(day0.getMonth() + 1).padStart(2, '0')}-${String(day0.getDate()).padStart(2, '0')}`;
  const buffer = opts.bufferMin ?? 10;
  const prod = opts.productivity ?? DEFAULT_PRODUCTIVITY;
  let startMin = opts.dayStartMin ?? 9 * 60;
  const endMin = opts.dayEndMin ?? 21 * 60;
  if (opts.notBefore && opts.notBefore > base) {
    const nb = Math.ceil((opts.notBefore - base) / MIN / SLOT) * SLOT;
    startMin = Math.max(startMin, nb);
  }

  // Busy intervals in minutes-of-day, padded by the buffer.
  const blocks = busy
    .map((b) => [Math.max(0, (b.start - base) / MIN - buffer), Math.min(24 * 60, (b.end - base) / MIN + buffer)] as [number, number])
    .filter(([s, e]) => e > 0 && s < 24 * 60);
  const isFree = (s: number, e: number) => blocks.every(([bs, be]) => e <= bs || s >= be);

  const ordered = [...tasks].sort((a, b) => taskUrgency(b, dayKey) - taskUrgency(a, dayKey) || a.order - b.order);
  const result: PlanResult = { scheduled: [], unscheduled: [] };

  for (const t of ordered) {
    const dur = Math.max(SLOT, Math.round((t.estimate ?? 30) / 5) * 5);
    let best: { s: number; score: number } | null = null;
    for (let s = startMin; s + dur <= endMin; s += SLOT) {
      if (!isFree(s, s + dur)) continue;
      // Average productivity across the block's hours.
      let w = 0;
      for (let m = s; m < s + dur; m += SLOT) w += prod[Math.floor(m / 60) % 24];
      w /= Math.ceil(dur / SLOT);
      const earliness = 1 - (s - startMin) / Math.max(1, endMin - startMin);
      const score = energyFit(t.energy, w) * 0.7 + earliness * 0.3;
      if (!best || score > best.score) best = { s, score };
    }
    if (!best) {
      result.unscheduled.push(t.id);
      continue;
    }
    result.scheduled.push({ taskId: t.id, start: base + best.s * MIN, end: base + (best.s + dur) * MIN });
    blocks.push([best.s - buffer, best.s + dur + buffer]);
  }
  result.scheduled.sort((a, b) => a.start - b.start);
  return result;
}
