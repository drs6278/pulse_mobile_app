import { DateTime } from 'luxon';
import type { ScheduleDraft } from './types';
import { localDate, toLocal } from './time';

export function newScheduleDraft(timezone: string, selected?: string, now: DateTime = DateTime.now()): ScheduleDraft {
  const today = now.setZone(timezone);
  const date = typeof selected === 'string' && localDate(selected) ? selected : today.toISODate()!;
  const start = date === today.toISODate() ? today.startOf('hour').plus({ hours: 1 }) : DateTime.fromISO(`${date}T09:00:00`, { zone: timezone });
  return { title: '', kind: 'commitment', location: '', timezone, start_local: toLocal(start), end_local: toLocal(start.plus({ hours: 1 })), term_end: start.toISODate()!, all_day: false, busy: true, recurrence: null, rdates: [], exdates: [], source_uid: null };
}

// Calculate in wall time so moving an entry across DST retains the displayed duration.
export function moveScheduleStart(draft: ScheduleDraft, start_local: string): Partial<ScheduleDraft> {
  const start = DateTime.fromISO(draft.start_local, { zone: 'UTC' });
  const end = DateTime.fromISO(draft.end_local, { zone: 'UTC' });
  const next = DateTime.fromISO(start_local, { zone: 'UTC' });
  const duration = end.diff(start).toMillis();
  return { start_local, ...(next.isValid && duration > 0 ? { end_local: toLocal(next.plus({ milliseconds: duration })) } : {}) };
}

export function inclusiveEnd(draft: ScheduleDraft) {
  return draft.all_day ? toLocal(DateTime.fromISO(draft.end_local, { zone: 'UTC' }).minus({ days: 1 })) : draft.end_local;
}

export function setInclusiveEnd(value: string, allDay: boolean) {
  return allDay ? toLocal(DateTime.fromISO(value, { zone: 'UTC' }).plus({ days: 1 }).startOf('day')) : value;
}

export function scheduleSummary(draft: ScheduleDraft) {
  const start = DateTime.fromISO(draft.start_local, { zone: 'UTC' });
  const end = DateTime.fromISO(inclusiveEnd(draft), { zone: 'UTC' });
  if (!start.isValid || !end.isValid) return 'Date or time needs correction';
  const date = start.toLocaleString(DateTime.DATE_MED_WITH_WEEKDAY);
  const time = draft.all_day ? 'All day' : `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`;
  const endDate = start.toISODate() !== end.toISODate() ? ` – ${end.toLocaleString(DateTime.DATE_MED)}` : '';
  const repeat = draft.recurrence ? ` · ${draft.recurrence.days.map(day => ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day - 1]).join(', ')}${draft.recurrence.interval > 1 ? ` every ${draft.recurrence.interval} weeks` : ' weekly'} · through ${DateTime.fromISO(draft.term_end).toLocaleString(DateTime.DATE_MED)}` : '';
  return `${date}${endDate} · ${time}${repeat}`;
}
