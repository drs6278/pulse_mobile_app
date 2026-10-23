import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { PulseEvent } from '../event-query';
import { eventDetailsColumns, EVENTS_PER_PAGE } from '../event-query';
import { type OwnProfile, type PrivateProfile, type PublicProfile, type ProfileDraft, type ReportReason, validateProfile } from './types';

export const publicProfileColumns = 'user_id,display_name,bio,avatar_path,version,updated_at';
export function profileSessionClient(token: string | undefined) {
  if (!token) throw new Error('Sign in again before saving.');
  return createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    accessToken: async () => token,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
export function profileError(reason: unknown): string {
  const error = reason as { code?: string; message?: string };
  if (['42P01', '42883', 'PGRST202', 'PGRST205', '42703'].includes(error?.code ?? '')) return 'Profiles are not available on this server yet. Please try again after the server update.';
  return error?.message || 'Unable to connect. Please try again.';
}
export async function loadOwnProfile(client: SupabaseClient, user: string, signal: AbortSignal): Promise<OwnProfile> {
  const [privateResult, publicResult] = await Promise.all([
    client.from('private_profiles').select('user_id,age_band,account_state,profile_hidden,created_at').eq('user_id', user).abortSignal(signal).single<PrivateProfile>(),
    client.from('profiles').select(publicProfileColumns).eq('user_id', user).abortSignal(signal).maybeSingle<PublicProfile>(),
  ]);
  if (privateResult.error) throw new Error(profileError(privateResult.error));
  if (publicResult.error) throw new Error(profileError(publicResult.error));
  return { private: privateResult.data, public: publicResult.data };
}
export async function loadPublicProfile(client: SupabaseClient, user: string, signal: AbortSignal) {
  const { data, error } = await client.from('profiles').select(publicProfileColumns).eq('user_id', user).abortSignal(signal).maybeSingle<PublicProfile>();
  if (error) throw new Error(profileError(error));
  return data;
}
export async function saveProfile(client: SupabaseClient, draft: ProfileDraft, version: number, avatarPath?: string | null) {
  const errors = Object.values(validateProfile(draft));
  if (errors.length) throw new Error(errors.join('\n'));
  // One transaction saves text, age, and photo; failed saves keep the old photo.
  const { error } = await client.rpc('save_profile', { p_name: draft.display_name.trim(), p_bio: draft.bio.trim(), p_age: draft.age_band, p_version: version, p_avatar: avatarPath ?? null, p_change_avatar: avatarPath !== undefined });
  if (error) throw new Error(profileError(error));
}
export async function fetchHostedEvents(client: SupabaseClient, user: string, page: number, signal: AbortSignal) {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error, count } = await client.from('events').select(eventDetailsColumns, { count: 'exact' }).eq('created_by', user)
    .eq('pulse_cancelled', false).gte('event_date', today).order('event_date').order('id')
    .range(page * EVENTS_PER_PAGE, (page + 1) * EVENTS_PER_PAGE - 1).abortSignal(signal).returns<PulseEvent[]>();
  if (error) throw new Error(profileError(error));
  return { events: data ?? [], count: count ?? 0 };
}
export async function setUserBlock(client: SupabaseClient, user: string, blocked: boolean) {
  const { error } = await client.rpc('set_user_block', { p_user: user, p_blocked: blocked });
  if (error) throw new Error(profileError(error));
}
export async function loadBlockedProfiles(client: SupabaseClient, signal: AbortSignal) {
  const { data, error } = await client.rpc('list_blocked_profiles').abortSignal(signal);
  if (error) throw new Error(profileError(error));
  return (data ?? []) as { user_id: string; display_name: string }[];
}
export async function reportProfile(client: SupabaseClient, user: string, reason: ReportReason, details: string) {
  if (Array.from(details).length > 1000) throw new Error('Keep report details to 1,000 characters.');
  const { error } = await client.rpc('report_profile', { p_user: user, p_reason: reason, p_details: details.trim() });
  if (error) throw new Error(profileError(error));
}
export async function invokeProfileFunction<T>(client: SupabaseClient, name: string, body: object | ArrayBuffer, mime?: string): Promise<T> {
  const { data, error } = await client.functions.invoke(name, { body, ...(mime ? { headers: { 'Content-Type': mime } } : {}) });
  if (error) {
    let message = 'Unable to complete this request. Please try again.';
    try { const response = await error.context?.json(); if (typeof response?.error === 'string') message = response.error; } catch { /* Transport errors have no JSON response. */ }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data as T;
}
