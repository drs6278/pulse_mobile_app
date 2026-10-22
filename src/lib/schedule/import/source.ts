import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_FILE_BYTES, type ImportResult, type ScheduleSource } from '../types';
import { utf8Bytes } from './utf8';

export type PickedScheduleFile = { name: string; text?: string; bytes?: Uint8Array<ArrayBuffer> };

export async function prepareScheduleSource(client: SupabaseClient, file: PickedScheduleFile, timezone: string, termEnd: string): Promise<{ source: ScheduleSource; result: ImportResult }> {
  const format = /\.ics$/i.test(file.name) ? 'ics' : /\.csv$/i.test(file.name) ? 'csv' : null;
  if (!format) throw new Error('Select an .ics or .csv file. Image and PDF imports are not supported yet.');
  const bytes = file.bytes ?? utf8Bytes(file.text ?? '');
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error('Choose a nonempty file up to 2 MiB.');
  const { data, error } = await client.rpc('create_schedule_source', { p_label: file.name.slice(0, 200), p_format: format });
  if (error) throw new Error(['42P01', 'PGRST202', 'PGRST205'].includes(error.code) ? 'Schedule uploads are unavailable. Apply the schedule review migration and deploy the schedule-source function, then retry.' : error.message);
  const source = data as ScheduleSource;
  try {
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    const upload = await client.storage.from('schedule-sources').upload(source.object_path, body, { contentType: format === 'ics' ? 'text/calendar' : 'text/csv', upsert: false });
    if (upload.error) throw upload.error;
    const extracted = await client.functions.invoke('schedule-source', { body: { sourceId: source.id, timezone, termEnd } });
    if (extracted.error) {
      // FunctionsHttpError preserves the server's actionable parser message.
      let message = 'Unable to process this file. Check that the schedule-source function is deployed, then retry.';
      try {
        const response = (extracted.error as { context?: Response }).context;
        const body = response ? await response.json() : null;
        if (typeof body?.error === 'string') message = body.error;
      } catch { /* Keep the safe deployment message for non-JSON errors. */ }
      throw new Error(message);
    }
    const result = extracted.data as ImportResult;
    if (!result || !Array.isArray(result.candidates) || !Array.isArray(result.errors) || !Array.isArray(result.warnings)) throw new Error('The schedule processor returned an invalid preview.');
    return { source, result };
  } catch (reason) {
    await discardScheduleSource(client, source).catch(() => undefined);
    throw reason;
  }
}

export async function discardScheduleSource(client: SupabaseClient, source: ScheduleSource) {
  const { error } = await client.rpc('discard_schedule_source', { p_source: source.id });
  if (error) throw error;
  await removeSourceObject(client, source);
}

// The database records the cleanup request before this best-effort removal.
// A scheduled backend worker retries failures without affecting confirmed entries.
export async function removeSourceObject(client: SupabaseClient, source: ScheduleSource) {
  const { error } = await client.storage.from('schedule-sources').remove([source.object_path]);
  if (error) throw error;
  const finished = await client.rpc('finish_schedule_source_cleanup', { p_source: source.id });
  if (finished.error) throw finished.error;
}
