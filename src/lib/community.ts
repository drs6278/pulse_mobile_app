import { DateTime } from 'luxon';
import { supabase } from '@/lib/supabase';
import { eventDetailsColumns, type PulseEvent } from '@/lib/event-query';

export type Club = { id: string; name: string; description: string; version: number };
export type Membership = { club_id: string; user_id: string; role: 'admin' | 'officer' | 'member' };
export type ManagedEvent = PulseEvent & { pulse_owner_id: string | null; pulse_club_id: string | null; pulse_description: string; pulse_status: 'draft' | 'published' | 'cancelled'; pulse_visibility: 'public' | 'private' | 'club_only' };
export const managedColumns = eventDetailsColumns;
export async function rpc<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data as T;
}
async function readAll<T>(table: string, columns: string, signal: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 20; page++) {
    const { data, error } = await supabase.from(table).select(columns).order(table === 'club_memberships' ? 'club_id' : 'id').order(table === 'club_memberships' ? 'user_id' : 'id').range(page * 500, page * 500 + 499).abortSignal(signal);
    if (error) throw error;
    rows.push(...data as unknown as T[]);
    if (data.length < 500) return rows;
  }
  throw new Error('Too many records to load. Please contact support.');
}
async function readCommunity(userId: string, signal: AbortSignal) {
  const [clubs, memberships] = await Promise.all([readAll<Club>('clubs', 'id,name,description,version', signal), readAll<Membership>('club_memberships', '*', signal)]);
  const clubIds = memberships.filter(m => m.user_id === userId && m.role !== 'member').map(m => m.club_id);
  const events: ManagedEvent[] = [];
  for (let page = 0; page < 20; page++) {
    let query = supabase.from('events').select(managedColumns).order('id').range(page * 500, page * 500 + 499);
    query = clubIds.length ? query.or(`and(pulse_owner_id.eq.${userId},pulse_club_id.is.null),pulse_club_id.in.(${clubIds.join(',')})`) : query.eq('pulse_owner_id', userId).is('pulse_club_id', null);
    const { data, error } = await query.abortSignal(signal);
    if (error) throw error;
    events.push(...data as unknown as ManagedEvent[]);
    if (data.length < 500) return { clubs, memberships, events };
  }
  throw new Error('Too many managed events to load.');
}
export type EventForm = { title: string; location: string; category: string; description: string; start: string; end: string; timezone: string; club: string; visibility: ManagedEvent['pulse_visibility'] };
export function eventDraft(form: EventForm, status: ManagedEvent['pulse_status']) {
  const start = DateTime.fromISO(form.start, { zone: form.timezone });
  const end = DateTime.fromISO(form.end, { zone: form.timezone });
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.start) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(form.end) || !start.isValid || !end.isValid || end <= start) throw new Error('Enter valid start and end times; end must be after start.');
  if (start.toFormat("yyyy-MM-dd'T'HH:mm") !== form.start || end.toFormat("yyyy-MM-dd'T'HH:mm") !== form.end) throw new Error('That local time does not exist due to daylight saving time.');
  if (start.getPossibleOffsets().length > 1 || end.getPossibleOffsets().length > 1) throw new Error('That time occurs twice due to daylight saving time. Choose an unambiguous time or use UTC.');
  if (!form.title.trim() || !form.location.trim() || !form.category.trim()) throw new Error('Title, location and category are required.');
  if (form.visibility === 'club_only' && !form.club) throw new Error('Choose a club for a club-only event.');
  return { title: form.title.trim(), location: form.location.trim(), category: form.category, pulse_description: form.description, pulse_club_id: form.club || null, pulse_visibility: form.visibility, pulse_status: status, pulse_starts_at: start.toISO(), pulse_ends_at: end.toISO(), pulse_timezone: form.timezone };
}
export function communityError(error: unknown) {
  const e = error as { code?: string; message?: string };
  if (['42P01','42703','PGRST202','PGRST204','PGRST205'].includes(e?.code ?? '')) return 'Clubs and events are not set up on this server yet. Apply the Phase 2 migration in docs/CLUBS_EVENTS.md, then retry.';
  return e?.message ?? 'Unable to save. Refresh and try again.';
}

export async function loadCommunity(userId: string, signal: AbortSignal) {
  try { return await readCommunity(userId, signal); } catch (error) { throw new Error(communityError(error)); }
}

