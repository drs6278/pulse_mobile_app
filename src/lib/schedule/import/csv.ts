import { DateTime } from 'luxon';
import Papa from 'papaparse';
import { localDate, localTime, toLocal } from '../time';
import { MAX_FILE_BYTES, MAX_RECORDS, type ImportFieldIssue, type ImportResult, type ScheduleDraft } from '../types';
import { validateSchedule } from '../validation';
import { utf8Bytes } from './utf8';

export const CSV_HEADER = 'title,kind,location,days,start_time,end_time,start_date,end_date,timezone';
export const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export function parseCSV(text: string, timezone: string, termEnd: string): ImportResult {
  if (utf8Bytes(text).byteLength > MAX_FILE_BYTES) throw new Error('File exceeds the 2 MiB limit.');
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: value => value.trim().toLowerCase() });
  if (parsed.data.length > MAX_RECORDS) throw new Error('File exceeds 2,000 records.');
  const headers = parsed.meta.fields ?? [];
  const required = ['title', 'start_time', 'end_time', 'start_date'];
  const missing = required.filter(field => !headers.includes(field));
  if (missing.length) throw new Error(`Missing CSV columns: ${missing.join(', ')}. Use the documented template.`);
  const unknown = headers.filter(field => !CSV_HEADER.split(',').includes(field));
  if (unknown.length) throw new Error(`Unsupported CSV columns: ${unknown.join(', ')}.`);
  const errors = parsed.errors.filter(error => error.row === undefined).map(error => error.message);
  const candidates = parsed.data.map((row, index) => {
    const structuralIssues = parsed.errors.filter(error => error.row === index).map(error => error.message);
    const fieldIssues: ImportFieldIssue[] = [];
    const issue = (field: keyof ScheduleDraft, message: string) => fieldIssues.push({ field, message });
    const days = (row.days ?? '').trim().toUpperCase().split('|').filter(Boolean).map(day => weekdays.indexOf(day) + 1);
    if (days.some(day => day === 0)) issue('recurrence', 'Days must use MO|TU|WE|TH|FR|SA|SU.');
    if (!localTime(row.start_time)) issue('start_local', 'Start time must use 24-hour HH:mm.');
    if (!localTime(row.end_time)) issue('end_local', 'End time must use 24-hour HH:mm.');
    if (!localDate(row.start_date)) issue('start_local', 'Start date must use YYYY-MM-DD.');
    let start = DateTime.fromISO(`${row.start_date}T${row.start_time}`, { zone: 'UTC' });
    const finalDate = row.end_date?.trim() || (days.length ? termEnd : row.start_date);
    if (!days.length && finalDate !== row.start_date) issue('end_local', 'Review the end date for this one-off commitment.');
    // Semester start may precede the first matching weekday.
    if (days.length && start.isValid && !days.includes(start.weekday)) {
      for (let offset = 1; offset < 7; offset++) if (days.includes(start.plus({ days: offset }).weekday)) { start = start.plus({ days: offset }); break; }
    }
    const endDate = days.length ? start.toISODate() ?? row.start_date : finalDate;
    let end = DateTime.fromISO(`${endDate}T${row.end_time}`, { zone: 'UTC' });
    if (end < start) { end = end.plus({ days: 1 }); issue('end_local', 'Confirm the next-day end date and time for this overnight commitment.'); }
    if (row.kind && !['class', 'commitment'].includes(row.kind.trim())) issue('kind', 'Kind must be class or commitment.');
    const draft: ScheduleDraft = { title: row.title?.trim() ?? '', kind: row.kind?.trim() === 'commitment' ? 'commitment' : 'class', location: row.location?.trim() ?? '', start_local: start.isValid ? toLocal(start) : `${row.start_date ?? ''}T${row.start_time ?? ''}:00`, end_local: end.isValid ? toLocal(end) : `${endDate ?? ''}T${row.end_time ?? ''}:00`, timezone: row.timezone?.trim() || timezone, term_end: finalDate, all_day: false, busy: true, recurrence: days.length ? { days: [...new Set(days.filter(day => day >= 1 && day <= 7))].sort(), interval: 1, weekStart: 1, count: null, until: null } : null, rdates: [], exdates: [], source_uid: null };
    return { key: `csv:${index + 2}`, draft, exceptions: [], structuralIssues, fieldIssues, issues: [...structuralIssues, ...fieldIssues.map(item => item.message), ...validateSchedule(draft)] };
  });
  if (!candidates.length) errors.push('No schedule rows found.');
  return { candidates, errors, warnings: [] };
}
