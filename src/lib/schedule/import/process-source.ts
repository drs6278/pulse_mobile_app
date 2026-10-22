import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_FILE_BYTES } from '../types';
import { localDate, validZone } from '../time';
import { parseCSV } from './csv';
import { parseICS } from './ics';

export function parseScheduleSource(text: string, format: string, timezone: string, termEnd: string) {
  if (!validZone(timezone) || !localDate(termEnd)) throw new Error('Enter a valid IANA timezone and semester end.');
  if (!text.trim() || text.includes('\0')) throw new Error('Choose a nonempty UTF-8 calendar or CSV file.');
  if (format === 'ics') return parseICS(text, timezone, termEnd);
  if (format === 'csv') return parseCSV(text, timezone, termEnd);
  throw new Error('Only ICS and CSV imports are supported.');
}

/** Runs only in the Edge Function. Shares the exact parser used by unit tests. */
export async function processScheduleSource(client: SupabaseClient, userId: string, input: { sourceId: string; timezone: string; termEnd: string }) {
  if (!userId || typeof input.sourceId !== 'string' || !/^[0-9a-f-]{36}$/i.test(input.sourceId)) throw new Error('Choose a valid schedule upload.');
  const { data: source, error } = await client.from('schedule_sources').select('*').eq('id', input.sourceId).eq('user_id', userId).single();
  if (error || !source) throw new Error('This upload is unavailable. Choose the file again.');
  if (source.cleanup_requested || Date.parse(source.created_at) < Date.now() - 86400000) throw new Error('This upload has expired. Choose the file again.');
  if (source.object_path !== `${userId}/${source.id}.${source.format}`) throw new Error('Invalid upload path.');
  const downloaded = await client.storage.from('schedule-sources').download(source.object_path);
  if (downloaded.error || !downloaded.data) throw new Error('Unable to read the private upload. Choose the file again.');
  const blob = downloaded.data;
  const expectedType = source.format === 'ics' ? 'text/calendar' : 'text/csv';
  if (blob.type.split(';')[0] !== expectedType) throw new Error('The uploaded file type does not match its format.');
  if (!blob.size || blob.size > MAX_FILE_BYTES) throw new Error('Choose a nonempty file up to 2 MiB.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(await blob.arrayBuffer()); }
  catch { throw new Error('This file is not valid UTF-8. Export it as UTF-8 and try again.'); }
  const result = parseScheduleSource(text, source.format, input.timezone, input.termEnd);
  const marked = await client.rpc('mark_schedule_source_parsed', { p_source: source.id });
  if (marked.error) throw new Error('The upload changed or expired. Choose the file again.');
  return result;
}

export async function cleanupScheduleSources(client: SupabaseClient, userId?: string) {
  let query = client.from('schedule_sources').select('id,object_path').or(`cleanup_requested.eq.true,created_at.lt.${new Date(Date.now() - 86400000).toISOString()}`).order('created_at').limit(100);
  if (userId) query = query.eq('user_id', userId);
  const { data, error } = await query;
  if (error) throw error;
  let removed = 0, failed = 0;
  for (const source of data ?? []) {
    const deletion = await client.storage.from('schedule-sources').remove([source.object_path]);
    if (deletion.error) { failed++; continue; }
    const finished = await client.rpc('finish_schedule_source_cleanup', { p_source: source.id });
    if (finished.error) failed++; else removed++;
  }
  return { removed, failed, more: data?.length === 100 };
}
