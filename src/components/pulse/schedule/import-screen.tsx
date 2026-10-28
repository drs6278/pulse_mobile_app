import { EventDateTimeInput } from '../event-date-time-input';
import { scheduleSummary } from '@/lib/schedule/editor';
import { router } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useScheduleConflicts } from '@/hooks/use-schedule-conflicts';
import { compareImport } from '@/lib/schedule/import/deduplication';
import { correctCandidate, reviewDecisions } from '@/lib/schedule/import/review';
import { prepareScheduleSource, discardScheduleSource, removeSourceObject } from '@/lib/schedule/import/source';
import { pickScheduleFile } from '@/lib/schedule/import/read-file';
import { commitImport } from '@/lib/schedule/repository';
import { defaultPreferences, localDate, validZone } from '@/lib/schedule/time';
import type { ImportDecision, ImportResult, ScheduleDraft, ScheduleSource } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { PulseText, Screen, TitleHeader } from '../ui';
import { Button, Disclosure, Field, Loading, Message } from './controls';
import { DraftFields } from './draft-fields';

type Preview = { source: ScheduleSource; result: ImportResult; decisions: ImportDecision[]; requestKey: string };

export default function ImportScreen() {
  const schedule = useSchedule();
  return <Screen header={<TitleHeader title="Import schedule" />}><View style={{ padding: 16, gap: 16 }}>
    {schedule.loading ? <Loading /> : schedule.error ? <><Message text={schedule.error} error /><Button label="Retry" onPress={schedule.refresh} /></> : <ImportForm timezone={schedule.data?.preferences.timezone ?? defaultPreferences().timezone} />}
  </View></Screen>;
}

function ImportForm({ timezone }: { timezone: string }) {
  const schedule = useSchedule();
  const [zone, setZone] = useState(timezone), [termEnd, setTermEnd] = useState(DateTime.now().plus({ months: 4 }).toISODate()!);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false), [attempted, setAttempted] = useState(false);
  const [page, setPage] = useState(0), [editing, setEditing] = useState<string | null>(null);
  const working = useRef(false);
  const selected = useMemo(() => preview?.decisions.filter(item => item.action !== 'skip') ?? [], [preview]);
  const drafts = useMemo(() => selected.map(item => item.candidate), [selected]);
  const replacedIds = useMemo(() => selected.filter(item => item.action === 'update' && item.existing).map(item => item.existing!.id), [selected]);
  const conflicts = useScheduleConflicts(drafts, replacedIds);

  async function pick() {
    if (working.current || preview) return;
    if (!validZone(zone) || !localDate(termEnd)) { setError('Enter a valid IANA timezone and semester end first.'); return; }
    working.current = true; setBusy(true); setError(null);
    try {
      // Invoke directly within the press handler, before any await, for web activation.
      const file = await pickScheduleFile();
      if (!file) return;
      const { source, result } = await prepareScheduleSource(supabase, file, zone, termEnd);
      setReviewed(false); setAttempted(false); setPage(0); setEditing(null);
      setPreview({ source, result, decisions: compareImport(result.candidates, schedule.data?.series ?? [], schedule.data?.exceptions ?? []), requestKey: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to read this file.'); }
    finally { working.current = false; setBusy(false); }
  }
  function correct(key: string, patch: Partial<ScheduleDraft>, clearExceptions = false) {
    if (attempted || busy) return;
    setReviewed(false); setError(null);
    setPreview(previous => {
      if (!previous) return previous;
      const candidates = previous.decisions.map(item => item.candidate.key === key ? correctCandidate(item.candidate, patch, clearExceptions) : item.candidate);
      return { ...previous, decisions: reviewDecisions(candidates, schedule.data?.series ?? [], schedule.data?.exceptions ?? [], previous.decisions) };
    });
  }
  async function save() {
    if (!preview || !reviewed || !selected.length || working.current) return;
    working.current = true; setBusy(true); setError(null); setAttempted(true);
    try {
      await schedule.mutate(async () => {
        await commitImport(supabase, preview.requestKey, preview.source.label, preview.decisions, preview.source.id);
        // Cleanup is independent of the successful database transaction.
        await removeSourceObject(supabase, preview.source).catch(() => undefined);
      });
      router.replace('/calendar');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import was not confirmed. Retry safely.'); }
    finally { working.current = false; setBusy(false); }
  }
  async function discard() {
    if (!preview || working.current) return;
    working.current = true; setBusy(true); setError(null);
    try { await discardScheduleSource(supabase, preview.source); }
    catch { setError('Preview discarded. Source cleanup will be retried automatically; abandoned uploads expire after 24 hours.'); }
    finally { setPreview(null); setEditing(null); setReviewed(false); setAttempted(false); working.current = false; setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <PulseText size={20}>Bring your timetable into Pulse</PulseText>
    <Message text="Choose an ICS calendar or CSV schedule, then review before saving." />
    <EventDateTimeInput label="Semester end" mode="date" value={`${termEnd}T00:00:00`} timezone="UTC" disabled={busy || !!preview} onChange={value => setTermEnd(value.slice(0, 10))} />
    <Disclosure label="Timezone options" summary={`Times without a timezone use ${zone.replace(/_/g, ' ')}`}>
      <Field label="Timezone for floating times" value={zone} onChange={setZone} editable={!busy && !preview} />
    </Disclosure>
    <Button label={busy ? 'Working…' : 'Choose ICS or CSV file'} onPress={() => void pick()} disabled={busy || !!preview} />
    <Message text={error} error />
    {preview && <>
      <PulseText size={22}>{preview.source.label}</PulseText>
      <Message text={`${preview.decisions.filter(item => item.action === 'add').length} additions | ${preview.decisions.filter(item => item.action === 'update').length} updates | ${preview.decisions.filter(item => item.action === 'skip' && !item.candidate.issues.length).length} skipped | ${preview.decisions.filter(item => item.candidate.issues.length).length} invalid`} />
      {preview.result.warnings.map((text, index) => <Message key={`w${index}`} text={text} />)}
      {preview.result.errors.slice(0, 25).map((text, index) => <Message key={`e${index}`} text={text} error />)}
      {preview.result.errors.length > 25 && <Message text={`${preview.result.errors.length} records could not be parsed; showing the first 25 errors. Rejected records will not be saved.`} error />}
      <Message text="Correct entries before confirming. Exact duplicates and invalid entries are skipped. Changed source IDs require explicit update selection and replace their occurrence changes." />
      {!conflicts.complete && <Message text="Conflict check is incomplete because some schedule or RSVP times are unavailable, invalid, or exceed the comparison limit. Overlap warnings do not prevent saving." />}
      {attempted && <Message text="This save was attempted. Corrections and selections are locked so Retry sends the same request. Discard and choose the file again to start a different import." />}
      <Message text={`${preview.decisions.length} preview entries · page ${page + 1} of ${Math.max(1, Math.ceil(preview.decisions.length / 25))}`} />
      {preview.decisions.slice(page * 25, (page + 1) * 25).map((decision, index) => <View key={decision.candidate.key} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#2B303A' }}>
        <PulseText>{decision.candidate.draft.title || 'Untitled entry'}</PulseText>
        <Message text={`${scheduleSummary(decision.candidate.draft)}\n${decision.candidate.draft.timezone.replace(/_/g, ' ')}`} />
        {decision.candidate.issues.map((text, issue) => <Message key={issue} text={text} error />)}
        {!!conflicts.byKey[decision.candidate.key]?.length && <Message text={`Overlaps with ${conflicts.byKey[decision.candidate.key].join(', ')}. You can still import this entry.`} />}
        <Button label={`${editing === decision.candidate.key ? 'Close editor' : 'Correct entry'}: ${decision.candidate.draft.title || index + 1}`} disabled={busy || attempted || !!decision.candidate.structuralIssues?.length} onPress={() => setEditing(editing === decision.candidate.key ? null : decision.candidate.key)} />
        {editing === decision.candidate.key && <DraftFields errors={decision.candidate.issues} draft={decision.candidate.draft} disabled={busy || attempted} onChange={patch => correct(decision.candidate.key, patch)} />}
        {editing === decision.candidate.key && !!decision.candidate.exceptions.length && <>
          <Message text={`${decision.candidate.exceptions.length} imported occurrence changes are preserved. Removing them resets moved or canceled dates to the series rule in this preview.`} />
          {decision.candidate.exceptions.slice(0, 25).map(exception => <Message key={exception.recurrence_key} text={`${exception.recurrence_key}: ${exception.cancelled ? 'Canceled' : `${exception.start_local} → ${exception.end_local}`} (${decision.candidate.draft.timezone})`} />)}
          {decision.candidate.exceptions.length > 25 && <Message text="Showing the first 25 occurrence changes. Review remaining dates in Calendar after import." />}
          <Button label="Remove imported occurrence changes from preview" disabled={busy || attempted} onPress={() => correct(decision.candidate.key, {}, true)} />
        </>}
        <Button label={decision.candidate.issues.length ? 'Invalid — skipped' : decision.action === 'add' ? '✓ Add' : decision.action === 'update' ? 'Update existing — select to skip' : decision.reason === 'changed' ? 'Changed source — select to update' : decision.reason ? 'Duplicate — skipped' : 'Skipped — select to add'} disabled={busy || attempted || !!decision.candidate.issues.length || (!!decision.reason && decision.reason !== 'changed')}
          onPress={() => { setReviewed(false); setPreview(previous => previous && ({ ...previous, decisions: previous.decisions.map((item, i) => i === page * 25 + index ? { ...item, action: item.action === 'skip' ? item.existing ? 'update' : 'add' : 'skip' } : item) })); }} />
      </View>)}
      {preview.decisions.length > 25 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button label="Previous preview page" disabled={page === 0 || busy} onPress={() => { setPage(value => value - 1); setEditing(null); }} /><Button label="Next preview page" disabled={(page + 1) * 25 >= preview.decisions.length || busy} onPress={() => { setPage(value => value + 1); setEditing(null); }} /></View>}
      <Button label={reviewed ? '✓ Reviewed timezone, selections and updates' : 'Confirm timezone, selections and updates'} disabled={busy || attempted} onPress={() => setReviewed(!reviewed)} />
      <Button label={`Save ${selected.length} selected entries`} disabled={busy || !reviewed || !selected.length} onPress={() => void save()} />
      <Button label="Discard preview" disabled={busy} onPress={() => void discard()} />
    </>}
    <Disclosure label="File formats & upload details">
    <Message text="ICS and CSV files up to 2 MiB and 2,000 records are supported. Images and PDFs are not supported. Files are uploaded privately for validation and deleted after saving or discarding; abandoned uploads expire after 24 hours." />
    <Message text="CSV columns: title,kind,location,days,start_time,end_time,start_date,end_date,timezone. Required: title,start_time,end_time,start_date. Defaults: class, empty location, confirmed timezone, and chosen semester end for weekly entries. Use MO|WE|FR, HH:mm and YYYY-MM-DD. Leave days blank for a one-off entry. Unsupported ICS recurrence is reported rather than approximated." />
    </Disclosure>
  </View>;
}
