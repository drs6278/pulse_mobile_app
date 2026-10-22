import type { SupabaseClient } from '@supabase/supabase-js';
import { eventDetailsColumns, type PulseEvent } from './event-query';

export type RSVP = { event_id: string; status: 'going' | 'waitlisted' | 'cancelled'; event: PulseEvent | null };
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
export async function setRSVP(client: SupabaseClient, userId: string, eventId: string, status: 'going' | 'cancelled') {
  if (!userId) throw new Error('Sign in required.');
  const { data, error } = await client.rpc('set_event_rsvp', { p_event: eventId, p_status: status });
  if (error) throw error;
  return data as RSVP['status'];
}

export type Attendance = { event_id: string; going: number; waitlisted: number; capacity: number | null };
export async function loadAttendance(client: SupabaseClient, ids: string[], signal?: AbortSignal): Promise<Attendance[]> {
  if (!ids.length) return [];
  let query = client.rpc('event_attendance', { p_events: ids });
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await query;
  if (error) throw error;
  return data as Attendance[];
}
