import type { SupabaseClient } from '@supabase/supabase-js';
import { eventColumns, type PulseEvent } from './event-query';

export type SavedEvent = { event_id: string; created_at: string; event: PulseEvent | null };
export function savedEventsError(reason: unknown) {
  const error = reason as { code?: string; message?: string };
  return ['42P01', 'PGRST205'].includes(error?.code ?? '')
    ? 'Saved events are unavailable until the server update is applied.'
    : error?.message || 'Unable to update saved events. Please try again.';
}
export async function loadSavedEvents(client: SupabaseClient, user: string, signal: AbortSignal) {
  const rows: SavedEvent[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await client.from('saved_events')
      .select(`event_id::text,created_at,event:events(${eventColumns})`).eq('user_id', user)
      .order('created_at', { ascending: false }).order('event_id').range(offset, offset + 499)
      .abortSignal(signal).returns<SavedEvent[]>();
    if (error) throw new Error(savedEventsError(error));
    rows.push(...data ?? []);
    if ((data?.length ?? 0) < 500) return rows;
  }
}
export async function setEventSaved(client: SupabaseClient, user: string, eventId: string, saved: boolean) {
  const query = saved
    ? client.from('saved_events').upsert({ user_id: user, event_id: eventId }, { onConflict: 'user_id,event_id', ignoreDuplicates: true })
    : client.from('saved_events').delete().eq('user_id', user).eq('event_id', eventId);
  const { error } = await query;
  if (error) throw new Error(savedEventsError(error));
}
