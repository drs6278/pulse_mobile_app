import { DateTime } from 'luxon';
import { expandSchedule } from './recurrence';
import { validateSchedule } from './validation';
import type { Interval, ScheduleDraft, ScheduleException, ScheduleSeries } from './types';

export type ConflictDraft = { key: string; draft: ScheduleDraft; exceptions?: Omit<ScheduleException, 'series_id' | 'user_id'>[] };
export type ConflictResult = { byKey: Record<string, string[]>; complete: boolean };

// Bound both recurrence expansion and dense overlap work on mobile devices.
export function scheduleConflicts(drafts: ConflictDraft[], existing: ScheduleSeries[], exceptions: ScheduleException[], events: (Interval & { title: string })[], known: boolean, exclude?: { seriesId: string; recurrenceKey?: string }): ConflictResult {
  const result: ConflictResult = { byKey: {}, complete: known };
  const valid = drafts.filter(item => !validateSchedule(item.draft).length);
  if (!valid.length) return result;
  const start = Math.min(...valid.map(item => DateTime.fromISO(item.draft.start_local, { zone: item.draft.timezone }).toMillis()));
  const end = Math.max(...valid.map(item => DateTime.fromISO(item.draft.term_end, { zone: item.draft.timezone }).plus({ days: 8 }).toMillis()));
  const intervals: (Interval & { key?: string; title: string })[] = events.filter(item => item.start < end && item.end > start);
  const add = (series: ScheduleSeries, overrides: ScheduleException[], key?: string) => {
    if (intervals.length >= 10000) { result.complete = false; return; }
    try {
      for (const item of expandSchedule(series, overrides, { start, end })) {
        if (exclude?.seriesId === item.seriesId && (!exclude.recurrenceKey || exclude.recurrenceKey === item.recurrenceKey)) continue;
        if (item.busy) intervals.push({ ...item, key, title: series.title });
        if (intervals.length >= 10000) { result.complete = false; break; }
      }
    } catch { result.complete = false; }
  };
  valid.forEach(item => add({ ...item.draft, id: `preview:${item.key}`, user_id: '', import_id: null, version: 0, content_key: '' }, (item.exceptions ?? []).map(exception => ({ ...exception, series_id: `preview:${item.key}`, user_id: '' })), item.key));
  existing.forEach(series => add(series, exceptions));
  intervals.sort((a, b) => a.start - b.start);
  const names = new Map<string, Set<string>>();
  let comparisons = 0;
  for (let i = 0; i < intervals.length; i++) {
    const a = intervals[i];
    for (let j = i + 1; j < intervals.length && intervals[j].start < a.end; j++) {
      if (++comparisons > 20000) { result.complete = false; break; }
      const b = intervals[j];
      if (!a.key && !b.key) continue;
      if (a.key && a.key === b.key) continue;
      for (const [key, title] of [[a.key, b.title], [b.key, a.title]]) if (key) {
        const set = names.get(key) ?? new Set<string>(); set.add(title!); names.set(key, set);
      }
    }
    if (comparisons > 20000) break;
  }
  for (const [key, titles] of names) result.byKey[key] = [...titles].slice(0, 5);
  return result;
}
