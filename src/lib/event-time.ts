import { DateTime } from 'luxon';
import type { PulseEvent } from './event-query';

const fullDate = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' } as const;
const shortDate = { month: 'short', day: 'numeric' } as const;
const dayAndTime = { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' } as const;

function dateOnly(value: string, locale?: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
}

// Human-readable "when" for the event page: a date line and an optional time line, in the event's own zone.
export function eventWhen(event: PulseEvent, locale?: string): { date: string; time: string | null } {
  const zone = event.pulse_timezone ?? 'UTC';
  const opts = { zone, locale };
  if (event.pulse_all_day_start && event.pulse_all_day_end) {
    const first = DateTime.fromISO(event.pulse_all_day_start, opts);
    const last = DateTime.fromISO(event.pulse_all_day_end, opts).minus({ days: 1 }); // stored end is exclusive
    if (first.isValid && last.isValid) {
      if (last <= first) return { date: first.toLocaleString(fullDate), time: 'All day' };
      const end = last.toLocaleString({ ...shortDate, year: 'numeric' });
      return { date: `${first.toLocaleString(shortDate)} – ${end}`, time: 'All day' };
    }
  }
  if (event.pulse_starts_at) {
    const start = DateTime.fromISO(event.pulse_starts_at, opts);
    const end = event.pulse_ends_at ? DateTime.fromISO(event.pulse_ends_at, opts) : null;
    if (start.isValid) {
      const date = start.toLocaleString(fullDate);
      if (!end?.isValid) return { date, time: `${start.toLocaleString(DateTime.TIME_SIMPLE)} ${start.offsetNameShort}` };
      const sameDay = start.hasSame(end, 'day');
      const range = sameDay
        ? `${start.toLocaleString(DateTime.TIME_SIMPLE)} – ${end.toLocaleString(DateTime.TIME_SIMPLE)}`
        : `${start.toLocaleString(dayAndTime)} – ${end.toLocaleString(dayAndTime)}`;
      return { date, time: `${range} ${end.offsetNameShort}` };
    }
  }
  return { date: dateOnly(event.event_date, locale), time: null };
}
