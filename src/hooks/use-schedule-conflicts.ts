import { useMemo } from 'react';
import { eventInterval } from '@/lib/event-query';
import { scheduleConflicts, type ConflictDraft } from '@/lib/schedule/conflicts';
import { useSchedule } from '@/providers/schedule-provider';
import { useRSVPs } from '@/providers/rsvp-provider';

export function useScheduleConflicts(drafts: ConflictDraft[], excludedIds: string[] = [], exclude?: { seriesId: string; recurrenceKey?: string }) {
  const schedule = useSchedule(), rsvps = useRSVPs();
  return useMemo(() => {
    const attending = (rsvps.data ?? []).filter(item => item.status === 'going' && !item.event?.pulse_cancelled);
    const known = !!schedule.data && !!rsvps.data && !schedule.error && !rsvps.error && attending.every(item => item.event && eventInterval(item.event));
    const events = attending.flatMap(item => { const interval = item.event ? eventInterval(item.event) : null; return interval ? [{ ...interval, title: item.event!.title }] : []; });
    return scheduleConflicts(drafts, (schedule.data?.series ?? []).filter(item => !excludedIds.includes(item.id)), schedule.data?.exceptions ?? [], events, known, exclude);
  }, [drafts, excludedIds, exclude, schedule.data, schedule.error, rsvps.data, rsvps.error]);
}
