import { router } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { View } from 'react-native';
import { compareImport } from '@/lib/schedule/import/deduplication';
import { pickScheduleFile } from '@/lib/schedule/import/read-file';
import { commitImport } from '@/lib/schedule/repository';
import { defaultPreferences, localDate, validZone } from '@/lib/schedule/time';
import type { ImportDecision, ImportResult } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { PulseText, Screen, TitleHeader } from '../ui';
import { Button, Field, Loading, Message } from './controls';

export default function ImportScreen() {
  const schedule = useSchedule();
  return <Screen header={<TitleHeader title="Import schedule" />}><View style={{ padding: 16, gap: 16 }}>
    {schedule.loading ? <Loading /> : schedule.error ? <><Message text={schedule.error} error /><Button label="Retry" onPress={schedule.refresh} /></> : <ImportForm timezone={schedule.data?.preferences.timezone ?? defaultPreferences().timezone} />}
  </View></Screen>;
}
function ImportForm({ timezone }: { timezone: string }) {
  const schedule = useSchedule();
  const [zone, setZone] = useState(timezone), [termEnd, setTermEnd] = useState(DateTime.now().plus({ months: 4 }).toISODate()!);
  const [preview, setPreview] = useState<{ name: string; result: ImportResult; decisions: ImportDecision[]; requestKey: string } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [page, setPage] = useState(0);
  async function pick() {
    if (!validZone(zone) || !localDate(termEnd)) { setError('Enter a valid IANA timezone and semester end first.'); return; }
    setError(null);
    // Do not await anything before invoking the browser picker.
    const picked = pickScheduleFile();
    try {
      const file = await picked;
      if (!file) return;
      setBusy(true); setPreview(null); setReviewed(false); setAttempted(false); setPage(0);
      const result = /\.ics$/i.test(file.name) ? (await import('@/lib/schedule/import/ics')).parseICS(file.text, zone, termEnd) : (await import('@/lib/schedule/import/csv')).parseCSV(file.text, zone, termEnd);
      setPreview({ name: file.name, result, decisions: compareImport(result.candidates, schedule.data?.series ?? [], schedule.data?.exceptions ?? []), requestKey: `${Date.now()}-${Math.random().toString(36).slice(2)}` });
    } catch (reason) { setError(reason && typeof reason === 'object' && 'message' in reason ? String(reason.message) : 'Unable to read this file.'); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!preview) return;
    setBusy(true); setError(null); setAttempted(true);
    try {
      await schedule.mutate(() => commitImport(supabase, preview.requestKey, preview.name, preview.decisions));
      setPreview(null); router.replace('/calendar');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Import was not confirmed. Retry safely.'); setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <Message text="Select an ICS calendar or CSV schedule. Files stay on your device; only entries you review and select are saved. Up to 2 MiB and 2,000 records." />
    <Field label="Timezone for floating times" value={zone} onChange={value => { setZone(value); setPreview(null); }} editable={!busy && !preview} />
    <Field label="Semester end (YYYY-MM-DD)" value={termEnd} onChange={value => { setTermEnd(value); setPreview(null); }} editable={!busy && !preview} />
    <Button label={busy ? 'Working…' : 'Choose ICS or CSV file'} onPress={() => void pick()} disabled={busy} />
    <Message text={error} error />
    {preview && <>
      <PulseText size={22}>{preview.name}</PulseText>
      {preview.result.warnings.map((text, index) => <Message key={`w${index}`} text={text} />)}
      {preview.result.errors.slice(0, 25).map((text, index) => <Message key={`e${index}`} text={text} error />)}
      {preview.result.errors.length > 25 && <Message text={`${preview.result.errors.length} entries could not be parsed; showing the first 25 errors. Split the file to inspect the remaining errors. None of those rejected entries will be saved.`} error />}
      <Message text="Exact duplicates and invalid rows are skipped. Changed source IDs require explicit selection and replace their existing occurrence changes. Skipped entries keep their original import ownership." />
      <Message text={`${preview.decisions.length} preview entries · page ${page + 1} of ${Math.max(1, Math.ceil(preview.decisions.length / 25))}`} />
      {preview.decisions.slice(page * 25, (page + 1) * 25).map((decision, index) => <View key={decision.candidate.key} style={{ paddingVertical: 12, gap: 8, borderBottomWidth: 1, borderBottomColor: '#2B303A' }}>
        <PulseText>{decision.candidate.draft.title}</PulseText>
        <Message text={`${decision.candidate.draft.start_local} → ${decision.candidate.draft.end_local}\n${decision.candidate.draft.timezone} · through ${decision.candidate.draft.term_end}`} />
        {decision.candidate.issues.map((text, issue) => <Message key={issue} text={text} error />)}
        <Button label={decision.candidate.issues.length ? 'Invalid — skipped' : decision.action === 'add' ? '✓ Add' : decision.action === 'update' ? 'Update existing — select to skip' : decision.reason === 'changed' ? 'Changed source — select to update' : decision.reason ? 'Duplicate — skipped' : 'Skipped — select to add'} disabled={busy || attempted || !!decision.candidate.issues.length || (!!decision.reason && decision.reason !== 'changed')}
          onPress={() => { setReviewed(false); setPreview(previous => previous && ({ ...previous, decisions: previous.decisions.map((item, i) => i === page * 25 + index ? { ...item, action: item.action === 'skip' ? item.existing ? 'update' : 'add' : 'skip' } : item) })); }} />
      </View>)}
      {preview.decisions.length > 25 && <View style={{ flexDirection: 'row', gap: 8 }}><Button label="Previous preview page" disabled={page === 0 || busy} onPress={() => setPage(value => value - 1)} /><Button label="Next preview page" disabled={(page + 1) * 25 >= preview.decisions.length || busy} onPress={() => setPage(value => value + 1)} /></View>}
      <Button label={reviewed ? '✓ Reviewed timezone, selections and updates' : 'Confirm timezone, selections and updates'} disabled={busy || attempted} onPress={() => setReviewed(!reviewed)} />
      <Button label={`Save ${preview.decisions.filter(item => item.action !== 'skip').length} selected entries`} disabled={busy || !reviewed || !preview.decisions.some(item => item.action !== 'skip')} onPress={() => void save()} />
      <Button label="Discard preview" disabled={busy} onPress={() => { setPreview(null); setError(null); }} />
    </>}
    <Message text="CSV columns: title,kind,location,days,start_time,end_time,start_date,end_date,timezone. Use MO|WE|FR for days, HH:mm for times and YYYY-MM-DD for dates. Leave days blank for a one-off entry. Unsupported ICS recurrence is reported rather than approximated." />
  </View>;
}
