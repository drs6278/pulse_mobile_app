import type { SupabaseClient } from '@supabase/supabase-js';

export type PulseEvent = {
  id: string;
  title: string;
  event_date: string;
  location: string;
  category: string;
};
export const eventColumns = 'id,title,event_date,location,category';
export const EVENTS_PER_PAGE = 20;

type EventSearch = { categories: string[]; start: string; end: string | null };

export async function fetchEvents(client: SupabaseClient, search: EventSearch, page: number, signal: AbortSignal) {
  let query = client.from('events').select(eventColumns, { count: 'exact' })
    .gte('event_date', search.start)
    .order('event_date', { ascending: true }).order('id', { ascending: true });
  if (search.categories.length) query = query.in('category', search.categories);
  if (search.end) query = query.lte('event_date', search.end);
  const first = page * EVENTS_PER_PAGE;
  const { data, error, count } = await query.range(first, first + EVENTS_PER_PAGE - 1).abortSignal(signal).returns<PulseEvent[]>();
  if (error) throw error;
  return { events: data ?? [], count: count ?? 0 };
}
