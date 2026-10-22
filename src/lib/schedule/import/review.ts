import { DateTime } from 'luxon';
import { validateSchedule } from '../validation';
import { wallTime } from '../time';
import { expandSchedule } from '../recurrence';
import type { ImportCandidate, ImportDecision, ScheduleDraft, ScheduleException, ScheduleSeries } from '../types';
import { compareImport } from './deduplication';

export function candidateIssues(candidate: ImportCandidate): string[] {
  const issues = [...(candidate.structuralIssues ?? []), ...(candidate.fieldIssues ?? []).map(issue => issue.message), ...validateSchedule(candidate.draft)];
  if (!issues.length && candidate.exceptions.length) {
    const draft = candidate.draft;
    const series: ScheduleSeries = { ...draft, id: 'review', user_id: '', import_id: null, version: 0, content_key: '' };
    const identities = new Set(expandSchedule(series, [], { start: DateTime.fromISO(draft.start_local, { zone: draft.timezone }).minus({ days: 8 }).toMillis(), end: DateTime.fromISO(draft.term_end, { zone: draft.timezone }).plus({ days: 8 }).toMillis() }).map(item => item.recurrenceKey));
    if (candidate.exceptions.some(item => !identities.has(item.recurrence_key))) issues.push('Occurrence changes no longer match this series. Restore its dates and repeat settings, or remove the imported occurrence changes.');
  }
  for (const exception of candidate.exceptions) {
    if (!wallTime(exception.recurrence_key, candidate.draft.timezone)) issues.push('An occurrence has an invalid original identity.');
    if (!exception.cancelled) {
      const start = wallTime(exception.start_local ?? '', candidate.draft.timezone), end = wallTime(exception.end_local ?? '', candidate.draft.timezone);
      if (!start || !end || end <= start || end.diff(start, 'days').days > 7) issues.push('An occurrence exception has invalid start/end times.');
    }
  }
  return [...new Set(issues)];
}

export function correctCandidate(candidate: ImportCandidate, patch: Partial<ScheduleDraft>, clearExceptions = false): ImportCandidate {
  const draft = { ...candidate.draft, ...patch };
  if (!draft.recurrence && !draft.rdates.length) draft.term_end = draft.start_local.slice(0, 10);
  const next = { ...candidate, draft, exceptions: clearExceptions ? [] : candidate.exceptions, fieldIssues: candidate.fieldIssues?.filter(issue => !(issue.field in patch)) };
  return { ...next, issues: candidateIssues(next) };
}

// Recompute the entire batch: correcting one entry can change another's duplicate status.
// Existing explicit skips survive, but a newly changed source always needs fresh consent.
export function reviewDecisions(candidates: ImportCandidate[], series: ScheduleSeries[], exceptions: ScheduleException[], previous: ImportDecision[] = []): ImportDecision[] {
  return compareImport(candidates, series, exceptions).map(decision => {
    const prior = previous.find(item => item.candidate.key === decision.candidate.key);
    if (!prior) return decision;
    if (decision.reason === 'changed' && prior.action === 'update' && prior.candidate === decision.candidate && prior.existing?.version === decision.existing?.version) return { ...decision, action: 'update' };
    if (decision.reason) return decision;
    return prior.action === 'skip' && !prior.reason ? { ...decision, action: 'skip' } : decision;
  });
}

export function hasMultipleOccurrences(draft: ScheduleDraft) { return !!draft.recurrence || draft.rdates.length > 0; }

export function occurrenceDraft(draft: ScheduleDraft): ScheduleDraft {
  return { ...draft, recurrence: null, rdates: [], exdates: [], term_end: draft.start_local.slice(0, 10) };
}

export function setLocalPart(value: string, part: 'date' | 'time', input: string) {
  const [date = '', time = '00:00:00'] = value.split('T');
  return part === 'date' ? `${input}T${time}` : `${date}T${input.length === 5 ? `${input}:00` : input}`;
}

export function setAllDay(draft: ScheduleDraft, all_day: boolean): Partial<ScheduleDraft> {
  if (!all_day) return { all_day };
  const start = draft.start_local.slice(0, 10);
  const end = draft.end_local.slice(0, 10);
  return { all_day, start_local: `${start}T00:00:00`, end_local: `${end > start ? end : DateTime.fromISO(start, { zone: 'UTC' }).plus({ days: 1 }).toISODate() ?? start}T00:00:00` };
}
