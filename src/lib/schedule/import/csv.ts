import { DateTime } from 'luxon';
import Papa from 'papaparse';
import { localDate, localTime, toLocal } from '../time';
import { MAX_FILE_BYTES, MAX_RECORDS, type ImportResult, type ScheduleDraft } from '../types';
import { validateSchedule } from '../validation';

export const CSV_HEADER = 'title,kind,location,days,start_time,end_time,start_date,end_date,timezone';
export const weekdays = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
export function parseCSV(text: string, timezone: string, termEnd: string): ImportResult {
  if (text.length > MAX_FILE_BYTES) throw new Error('File exceeds the 2 MiB limit.');
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
    const issues = parsed.errors.filter(error => error.row === index).map(error => error.message);
    const days = (row.days ?? '').trim().toUpperCase().split('|').filter(Boolean).map(day => weekdays.indexOf(day) + 1);
    if (days.some(day => day === 0)) issues.push('Days must use MO|TU|WE|TH|FR|SA|SU.');
    if (!localTime(row.start_time) || !localTime(row.end_time)) issues.push('Times must use 24-hour HH:mm.');
    if (!localDate(row.start_date)) issues.push('Start date must use YYYY-MM-DD.');
    let start = DateTime.fromISO(`${row.start_date}T${row.start_time}`, { zone: 'UTC' });
    const finalDate = row.end_date?.trim() || (days.length ? termEnd : row.start_date);
    if (!days.length && finalDate !== row.start_date) issues.push('A one-off CSV end_date must match start_date. Use manual entry for an overnight or multi-day commitment.');
    // Semester start may precede the first matching weekday.
    if (days.length && start.isValid && !days.includes(start.weekday)) {
      for (let offset = 1; offset < 7; offset++) if (days.includes(start.plus({ days: offset }).weekday)) { start = start.plus({ days: offset }); break; }
    }
    let end = DateTime.fromISO(`${start.toISODate()}T${row.end_time}`, { zone: 'UTC' });
    if (end < start) { end = end.plus({ days: 1 }); issues.push('Overnight CSV rows need manual review. Add this commitment manually with the next-day end date.'); }
    if (row.kind && !['class', 'commitment'].includes(row.kind.trim())) issues.push('Kind must be class or commitment.');
    const draft: ScheduleDraft = { title: row.title?.trim() ?? '', kind: row.kind?.trim() === 'commitment' ? 'commitment' : 'class', location: row.location?.trim() ?? '', start_local: toLocal(start), end_local: toLocal(end), timezone: row.timezone?.trim() || timezone, term_end: finalDate, all_day: false, busy: true, recurrence: days.length ? { days: [...new Set(days)].sort(), interval: 1, weekStart: 1, count: null, until: null } : null, rdates: [], exdates: [], source_uid: null };
    return { key: `csv:${index + 2}`, draft, exceptions: [], issues: [...issues, ...validateSchedule(draft)] };
  });
  if (!candidates.length) errors.push('No schedule rows found.');
  return { candidates, errors, warnings: [] };
}
