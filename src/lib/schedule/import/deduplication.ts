import type { ImportCandidate, ImportDecision, ScheduleDraft, ScheduleException, ScheduleSeries } from '../types';

export function contentKey(draft: ScheduleDraft) {
  return JSON.stringify([draft.title.trim().toLocaleLowerCase('en-US'), draft.kind, draft.location.trim().toLocaleLowerCase('en-US'), draft.start_local, draft.end_local, draft.timezone, draft.term_end, draft.all_day, draft.busy, draft.recurrence ? [Array.from(new Set(draft.recurrence.days)).sort(), draft.recurrence.interval, draft.recurrence.weekStart, draft.recurrence.count, draft.recurrence.until] : null, [...draft.rdates].sort(), [...draft.exdates].sort()]);
}
export function compareImport(candidates: ImportCandidate[], existing: ScheduleSeries[], exceptions: ScheduleException[] = []): ImportDecision[] {
  const seenUIDs = new Set<string>(), seenContent = new Set<string>();
  return candidates.map(candidate => {
    const key = contentKey(candidate.draft), uid = candidate.draft.source_uid;
    const repeated = seenContent.has(key) || (!!uid && seenUIDs.has(uid));
    seenContent.add(key); if (uid) seenUIDs.add(uid);
    const identity = uid ? existing.find(item => item.source_uid === uid) : undefined;
    const equivalent = existing.find(item => contentKey(item) === key);
    if (repeated || candidate.issues.length) return { candidate, action: 'skip', reason: repeated ? 'repeated' : 'invalid' };
    if (identity) {
      const keys = (items: Pick<ScheduleException, 'recurrence_key' | 'cancelled' | 'start_local' | 'end_local'>[]) => JSON.stringify(items.map(item => [item.recurrence_key,item.cancelled,item.start_local,item.end_local]).sort((a,b) => String(a[0]).localeCompare(String(b[0]))));
      const same = contentKey(identity) === key && keys(candidate.exceptions) === keys(exceptions.filter(item => item.series_id === identity.id));
      return { candidate, existing: identity, action: 'skip', reason: same ? 'duplicate' : 'changed' };
    }
    return { candidate, existing: equivalent, action: equivalent ? 'skip' : 'add', reason: equivalent ? 'duplicate' : undefined };
  });
}
