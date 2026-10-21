import { useMemo } from 'react';
import { expandSchedule } from '@/lib/schedule/recurrence';
import { overlaps } from '@/lib/schedule/availability';
import type { Interval } from '@/lib/schedule/types';
import { eventInterval } from '@/lib/event-query';
import { useSchedule } from '@/providers/schedule-provider';
import { useRSVPs } from '@/providers/rsvp-provider';

export function useCalendarEntries(range: Interval) {
  const schedule = useSchedule(), rsvps = useRSVPs();
  const { start, end } = range;
  return useMemo(() => {
    let error: string | null = null;
    const occurrences = [] as ReturnType<typeof expandSchedule>;
    try { for (const series of schedule.data?.series ?? []) occurrences.push(...expandSchedule(series, schedule.data?.exceptions ?? [], { start, end })); }
    catch (reason) { error = reason instanceof Error ? reason.message : 'Invalid schedule data.'; }
    const attending = rsvps.data?.filter(item => item.status === 'going') ?? [];
    const events = attending.flatMap(item => {
      const event = item.event, interval = event ? eventInterval(event) : null;
      return event && interval && !event.pulse_cancelled && overlaps(interval, { start, end }) ? [{ ...interval, event }] : [];
    });
    const unknown = attending.filter(item => !item.event || (!item.event.pulse_cancelled && !eventInterval(item.event) && item.event.event_date >= new Date(start - 86400000).toISOString().slice(0, 10) && item.event.event_date <= new Date(end + 86400000).toISOString().slice(0, 10)));
    return { occurrences, events, unknown, busy: [...occurrences.filter(item => item.busy), ...events], complete: !!schedule.data && !!rsvps.data && !schedule.loading && !rsvps.loading && !error && !unknown.length, error: error || schedule.error || rsvps.error, loading: schedule.loading || rsvps.loading };
  }, [schedule.data, schedule.error, schedule.loading, rsvps.data, rsvps.error, rsvps.loading, start, end]);
}
