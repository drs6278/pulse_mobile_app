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
export async function setRSVP(client: SupabaseClient, userId: string, eventId: string, status: RSVP['status']) {
  if (status === 'cancelled') {
    // Upsert also evaluates INSERT policies. A canceled/hidden event must remain
    // cancellable even when its policy no longer allows a fresh RSVP.
    const { data, error } = await client.from('event_rsvps').update({ status }).eq('user_id', userId).eq('event_id', eventId).select('status').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This RSVP is no longer available. Refresh your calendar.');
    return;
  }
  const { error } = await client.from('event_rsvps').upsert({ user_id: userId, event_id: eventId, status }, { onConflict: 'user_id,event_id' });
  if (error) throw error;
}
