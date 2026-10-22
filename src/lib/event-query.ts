import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

export type PulseEvent = {
  id: string;
  title: string;
  event_date: string;
  location: string;
  category: string;
  pulse_starts_at?: string | null;
  pulse_ends_at?: string | null;
  pulse_timezone?: string | null;
  pulse_cancelled?: boolean;
  pulse_revision?: number;
  pulse_all_day_start?: string | null;
  pulse_all_day_end?: string | null;
};
// PostgREST casts avoid losing precision when an existing backend uses bigint IDs.
export const eventColumns = 'id::text,title,event_date,location,category';
export const eventDetailsColumns = `${eventColumns},pulse_starts_at,pulse_ends_at,pulse_timezone,pulse_cancelled,pulse_revision,pulse_all_day_start,pulse_all_day_end`;
export const EVENTS_PER_PAGE = 20;

export function eventInterval(event: PulseEvent) {
  if (event.pulse_all_day_start && event.pulse_all_day_end) {
    const start = DateTime.fromISO(event.pulse_all_day_start, { zone: event.pulse_timezone ?? 'UTC' }).startOf('day').toMillis();
    const end = DateTime.fromISO(event.pulse_all_day_end, { zone: event.pulse_timezone ?? 'UTC' }).startOf('day').toMillis();
    return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
  }
  if (!event.pulse_starts_at || !event.pulse_ends_at) return null;
  const start = Date.parse(event.pulse_starts_at), end = Date.parse(event.pulse_ends_at);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? { start, end } : null;
}

// Separate from the discovery page: compatibility must see every bounded candidate.
export async function fetchCalendarCandidates(client: SupabaseClient, start: string, end: string, signal: AbortSignal) {
  const events: PulseEvent[] = [];
  for (let page = 0; page < 20; page++) {
    const dateStart = DateTime.fromISO(start).minus({ days: 2 }).toISODate();
    const dateEnd = DateTime.fromISO(end).plus({ days: 2 }).toISODate();
    const { data, error } = await client.from('events').select(eventDetailsColumns)
      .or(`and(pulse_starts_at.lt.${end},pulse_ends_at.gt.${start}),and(pulse_all_day_start.lte.${dateEnd},pulse_all_day_end.gte.${dateStart})`).eq('pulse_cancelled', false)
      .order('pulse_starts_at').order('id').range(page * 500, page * 500 + 499).abortSignal(signal).returns<PulseEvent[]>();
    if (error) throw error;
    events.push(...(data ?? []).filter(event => { const interval = eventInterval(event); return interval && interval.start < Date.parse(end) && Date.parse(start) < interval.end; }));
    if ((data?.length ?? 0) < 500) return events;
  }
  throw new Error('Too many events in this date range. Choose a smaller range.');
}

type EventSearch = { categories: string[]; start: string; end: string | null; title: string };

export async function fetchEvents(client: SupabaseClient, search: EventSearch, page: number, signal: AbortSignal) {
  let query = client.from('events').select(eventColumns, { count: 'exact' })
    .gte('event_date', search.start)
    .order('event_date', { ascending: true }).order('id', { ascending: true });
  if (search.categories.length) query = query.in('category', search.categories);
  if (search.end) query = query.lte('event_date', search.end);
  if (search.title) query = query.ilike('title', `%${search.title}%`);
  const first = page * EVENTS_PER_PAGE;
  const { data, error, count } = await query.range(first, first + EVENTS_PER_PAGE - 1).abortSignal(signal).returns<PulseEvent[]>();
  if (error) throw error;
  return { events: data ?? [], count: count ?? 0 };
}
