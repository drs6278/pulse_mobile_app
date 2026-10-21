import type { Compatibility, Interval } from './types';

export function overlaps(a: Interval, b: Interval) { return a.start < b.end && b.start < a.end; }
export function mergeIntervals(intervals: Interval[]): Interval[] {
  const merged: Interval[] = [];
  for (const item of intervals.filter(i => Number.isFinite(i.start) && Number.isFinite(i.end) && i.end > i.start).sort((a, b) => a.start - b.start)) {
    const previous = merged[merged.length - 1];
    if (previous && item.start <= previous.end) previous.end = Math.max(previous.end, item.end);
    else merged.push({ ...item });
  }
  return merged;
}
export function freeWindows(busy: Interval[], window: Interval, minimumMinutes = 30) {
  const free: Interval[] = [];
  let cursor = window.start;
  for (const interval of mergeIntervals(busy.filter(i => overlaps(i, window)))) {
    const end = Math.min(interval.start, window.end);
    if (end - cursor >= minimumMinutes * 60000) free.push({ start: cursor, end });
    cursor = Math.max(cursor, Math.min(interval.end, window.end));
  }
  if (window.end - cursor >= minimumMinutes * 60000) free.push({ start: cursor, end: window.end });
  return free;
}
export function compatibility(candidate: Interval | null, busy: Interval[], complete: boolean): Compatibility {
  if (!complete || !candidate || !Number.isFinite(candidate.start) || candidate.end <= candidate.start) return 'unknown';
  return busy.some(interval => overlaps(interval, candidate)) ? 'conflicting' : 'compatible';
}
