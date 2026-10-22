import type { SupabaseClient } from '@supabase/supabase-js';
import { contentKey } from './import/deduplication';
import { defaultPreferences } from './time';
import type { ImportDecision, ScheduleDraft, ScheduleException, ScheduleImport, SchedulePreferences, ScheduleSeries } from './types';
import { validateSchedule } from './validation';

export function scheduleError(error: unknown) {
  const value = error as { code?: string; message?: string };
  if (['42P01', '42703', 'PGRST200', 'PGRST202', 'PGRST204', 'PGRST205'].includes(value?.code ?? '')) return 'Scheduling is not set up on this server yet. Apply the scheduling migration described in README, then retry.';
  if (value?.code === '23505') return 'This entry already exists or changed during import. Refresh and review duplicates again.';
  return value?.message || 'Unable to connect. Your changes were not confirmed; retry safely.';
}
async function allRows<T>(client: SupabaseClient, table: string, userId: string, signal?: AbortSignal): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 20; page++) {
    let query = client.from(table).select('*').eq('user_id', userId).order(table === 'schedule_preferences' ? 'user_id' : 'id').range(page * 500, page * 500 + 499);
    if (signal) query = query.abortSignal(signal);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data ?? []) as T[]);
    if ((data?.length ?? 0) < 500) return rows;
  }
  throw new Error('Schedule exceeds the supported record limit. Remove an old import before continuing.');
}
export async function loadSchedule(client: SupabaseClient, userId: string, signal?: AbortSignal) {
  const [series, exceptions, imports, preferences] = await Promise.all([
    allRows<ScheduleSeries>(client, 'schedule_series', userId, signal),
    allRows<ScheduleException>(client, 'schedule_exceptions', userId, signal),
    allRows<ScheduleImport>(client, 'schedule_imports', userId, signal),
    allRows<SchedulePreferences>(client, 'schedule_preferences', userId, signal),
  ]);
  return { series, exceptions, imports, preferences: preferences[0] ?? defaultPreferences() };
}
export async function saveSchedule(client: SupabaseClient, draft: ScheduleDraft, existing?: ScheduleSeries, clearExceptions = false) {
  const errors = validateSchedule(draft);
  if (errors.length) throw new Error(errors.join('\n'));
  const { data, error } = await client.rpc('save_schedule', { p_id: existing?.id ?? null, p_version: existing?.version ?? 0, p_draft: { ...draft, content_key: contentKey(draft) }, p_clear_exceptions: clearExceptions });
  if (error) throw error;
  return data as ScheduleSeries;
}
export async function deleteSchedule(client: SupabaseClient, series: ScheduleSeries) {
  const { error } = await client.rpc('delete_schedule', { p_id: series.id, p_version: series.version });
  if (error) throw error;
}
export async function setException(client: SupabaseClient, series: ScheduleSeries, key: string, cancelled: boolean, start: string | null = null, end: string | null = null) {
  const { error } = await client.rpc('set_schedule_exception', { p_series: series.id, p_version: series.version, p_key: key, p_cancelled: cancelled, p_start: start, p_end: end });
  if (error) throw error;
}
export async function commitImport(client: SupabaseClient, key: string, label: string, decisions: ImportDecision[], sourceId?: string) {
  const entries = decisions.filter(item => item.action !== 'skip').map(item => {
    const errors = validateSchedule(item.candidate.draft);
    if (errors.length || item.candidate.issues.length) throw new Error('Correct or deselect invalid entries before saving.');
    return { id: item.action === 'update' ? item.existing?.id : null, version: item.existing?.version ?? 0, clear_exceptions: true, draft: { ...item.candidate.draft, content_key: contentKey(item.candidate.draft) }, exceptions: item.candidate.exceptions };
  });
  if (!entries.length) throw new Error('Select at least one valid entry.');
  const { error } = await client.rpc('commit_schedule_import', { p_key: key, p_label: label.slice(0, 200), p_entries: entries, ...(sourceId ? { p_source: sourceId } : {}) });
  if (error) throw error;
}
export async function clearSchedule(client: SupabaseClient) {
  const { error } = await client.rpc('clear_schedule');
  if (error) throw error;
}
export async function deleteImported(client: SupabaseClient, importId: string | null) {
  const { error } = await client.rpc('delete_imported_schedules', { p_import: importId });
  if (error) throw error;
}
export async function savePreferences(client: SupabaseClient, userId: string, preferences: SchedulePreferences) {
  if (preferences.version === 0) {
    const { error } = await client.from('schedule_preferences').insert({ ...preferences, user_id: userId, version: 1 });
    if (error) throw error;
  } else {
    const { version, ...values } = preferences;
    const { data, error } = await client.from('schedule_preferences').update(values).eq('user_id', userId).eq('version', version).select('version').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Preferences changed on another device. Refresh before saving.');
  }
}
