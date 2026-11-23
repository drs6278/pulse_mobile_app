import type { SupabaseClient } from '@supabase/supabase-js';
import { eventDetailsColumns, type PulseEvent } from './event-query';

export type RSVP = { event_id: string; status: 'going' | 'cancelled'; event: PulseEvent | null };
export async function loadRSVPs(client: SupabaseClient, userId: string, signal?: AbortSignal) {
  const result: RSVP[] = [];
  for (let page = 0; page < 20; page++) {
    let query = client.from('event_rsvps').select(`event_id::text,status,event:events(${eventDetailsColumns})`).eq('user_id', userId).order('event_id').range(page * 500, page * 500 + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    result.push(...(data ?? []) as unknown as RSVP[]);
    if ((data?.length ?? 0) < 500) return result;
  }
  throw new Error('Too many RSVPs to calculate availability reliably.');
}
export async function setRSVP(client: SupabaseClient, _userId: string, eventId: string, status: RSVP['status']) {
  const { error } = await client.rpc('set_event_rsvp', { p_event: eventId, p_status: status });
  if (error) throw error;
}
/** How many active accounts are going. Null until the event_going_count migration is installed. */
export async function goingCount(client: SupabaseClient, eventId: string, signal?: AbortSignal): Promise<number | null> {
  let query = client.rpc('event_going_count', { p_event: eventId });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) { if (['42883', 'PGRST202'].includes(error.code)) return null; throw error; }
  return Number(data);
}
