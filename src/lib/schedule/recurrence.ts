import { DateTime } from 'luxon';
import { toLocal, wallTime } from './time';
import { MAX_OCCURRENCES, type Interval, type ScheduleException, type ScheduleOccurrence, type ScheduleSeries } from './types';
import { validateSchedule } from './validation';

export function expandSchedule(series: ScheduleSeries, exceptions: ScheduleException[], range: Interval): ScheduleOccurrence[] {
  const errors = validateSchedule(series);
  if (errors.length) throw new Error(`Invalid schedule “${series.title}”: ${errors[0]}`);
  const start = DateTime.fromISO(series.start_local, { zone: 'UTC' });
  const duration = DateTime.fromISO(series.end_local, { zone: 'UTC' }).diff(start).toMillis();
  const endDate = DateTime.fromISO(series.term_end, { zone: 'UTC' }).endOf('day');
  const rule = series.recurrence;
  const keys = new Set<string>();
  if (!rule) keys.add(series.start_local);
  else {
    const weekAnchor = start.startOf('day').minus({ days: (start.weekday - rule.weekStart + 7) % 7 });
    const until = rule.until ? DateTime.fromISO(rule.until, { setZone: true }).toMillis() : Infinity;
    const localRangeStart = DateTime.fromISO(DateTime.fromMillis(range.start, { zone: series.timezone }).minus({ days: 7 }).toISODate()!, { zone: 'UTC' }).set({ hour: start.hour, minute: start.minute, second: start.second });
    const localRangeEnd = DateTime.fromISO(DateTime.fromMillis(range.end, { zone: series.timezone }).plus({ days: 1 }).toISODate()!, { zone: 'UTC' }).endOf('day');
    // COUNT requires enumeration from DTSTART. Other rules can jump directly to
    // the visible window; seven days of look-behind covers the maximum duration.
    const first = rule.count === null ? DateTime.max(start, localRangeStart) : start;
    const last = rule.count === null ? DateTime.min(endDate, localRangeEnd) : endDate;
    let count = 0;
    for (let date = first; date <= last; date = date.plus({ days: 1 })) {
      const weeks = Math.floor(date.startOf('day').diff(weekAnchor, 'days').days / 7);
      if (weeks % rule.interval || !rule.days.includes(date.weekday)) continue;
      const key = toLocal(date), instant = wallTime(key, series.timezone);
      if (!instant) continue; // RFC 5545: nonexistent recurrence times do not count.
      if (instant.toMillis() > until) break;
      if (rule.count !== null && count >= rule.count) break;
      count++;
      keys.add(key);
    }
    // A replacement can move into the visible window from an otherwise skipped
    // original date. Validate that original date against the unmodified rule.
    if (rule.count === null) for (const exception of exceptions.filter(item => item.series_id === series.id)) {
      const date = DateTime.fromISO(exception.recurrence_key, { zone: 'UTC' });
      const weeks = Math.floor(date.startOf('day').diff(weekAnchor, 'days').days / 7);
      const instant = wallTime(exception.recurrence_key, series.timezone);
      if (date >= start && date <= endDate && weeks % rule.interval === 0 && rule.days.includes(date.weekday) && date.toFormat('HH:mm:ss') === start.toFormat('HH:mm:ss') && instant && instant.toMillis() <= until) keys.add(exception.recurrence_key);
    }
  }
  series.rdates.forEach(key => keys.add(key));
  series.exdates.forEach(key => keys.delete(key));
  const overrides = new Map(exceptions.filter(item => item.series_id === series.id).map(item => [item.recurrence_key, item]));
  const result: ScheduleOccurrence[] = [];
  for (const key of keys) {
    const override = overrides.get(key);
    if (override?.cancelled) continue;
    const localStart = override?.start_local ?? key;
    const localEnd = override?.end_local ?? toLocal(DateTime.fromISO(key, { zone: 'UTC' }).plus({ milliseconds: duration }));
    const occurrenceStart = wallTime(localStart, series.timezone), occurrenceEnd = wallTime(localEnd, series.timezone);
    if (!occurrenceStart || !occurrenceEnd || occurrenceEnd <= occurrenceStart) throw new Error(`Invalid occurrence in “${series.title}”. Edit its time.`);
    const interval = { start: occurrenceStart.toMillis(), end: occurrenceEnd.toMillis() };
    if (interval.start < range.end && range.start < interval.end) result.push({ ...interval, id: `${series.id}:${key}`, seriesId: series.id, recurrenceKey: key, title: series.title, location: series.location, kind: series.kind, allDay: series.all_day, busy: series.busy });
    if (result.length > MAX_OCCURRENCES) throw new Error('Too many occurrences. Choose a smaller range.');
  }
  return result.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
}
