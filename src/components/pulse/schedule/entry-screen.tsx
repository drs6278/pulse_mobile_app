import { router, useLocalSearchParams } from 'expo-router';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { View } from 'react-native';
import { deleteSchedule, saveSchedule, setException } from '@/lib/schedule/repository';
import { defaultPreferences, toLocal } from '@/lib/schedule/time';
import type { ScheduleDraft, ScheduleSeries } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { Screen, TitleHeader } from '../ui';
import { Button, Field, Loading, Message } from './controls';

export default function ScheduleEntryScreen() {
  const { id, occurrence } = useLocalSearchParams<{ id?: string; occurrence?: string }>();
  const schedule = useSchedule();
  const existing = schedule.data?.series.find(item => item.id === id);
  return <Screen header={<TitleHeader title={id ? 'Edit schedule entry' : 'Add a commitment'} />}>
    <View style={{ padding: 16, gap: 16 }}>
      {schedule.loading ? <Loading /> : schedule.error ? <><Message text={schedule.error} error /><Button label="Retry" onPress={schedule.refresh} /></> : id && !existing ? <Message error text="This entry is no longer available. Return to Calendar and refresh." /> : <EntryForm key={`${id ?? 'new'}:${occurrence ?? 'series'}`} existing={existing} occurrence={occurrence} timezone={schedule.data?.preferences.timezone ?? defaultPreferences().timezone} />}
    </View>
  </Screen>;
}
function EntryForm({ existing, occurrence, timezone }: { existing?: ScheduleSeries; occurrence?: string; timezone: string }) {
  const schedule = useSchedule();
  const [draft, setDraft] = useState<ScheduleDraft>(() => {
    const now = DateTime.now().setZone(timezone).startOf('hour').plus({ hours: 1 });
    if (existing) {
      const exception = schedule.data?.exceptions.find(item => item.series_id === existing.id && item.recurrence_key === occurrence);
      const duration = DateTime.fromISO(existing.end_local, { zone: 'UTC' }).diff(DateTime.fromISO(existing.start_local, { zone: 'UTC' }));
      return { ...existing, ...(occurrence ? { start_local: exception?.start_local ?? occurrence, end_local: exception?.end_local ?? toLocal(DateTime.fromISO(occurrence, { zone: 'UTC' }).plus(duration)) } : {}) };
    }
    return { title: '', kind: 'commitment', location: '', timezone, start_local: toLocal(now), end_local: toLocal(now.plus({ hours: 1 })), term_end: now.toISODate()!, all_day: false, busy: true, recurrence: null, rdates: [], exdates: [], source_uid: null };
  });
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [clearExceptions, setClearExceptions] = useState(false);
  const hasExceptions = !!existing && schedule.data?.exceptions.some(item => item.series_id === existing.id);
  const change = (values: Partial<ScheduleDraft>) => { setDraft(previous => ({ ...previous, ...values })); setError(null); };
  async function perform(remove = false) {
    setBusy(true); setError(null);
    try {
      await schedule.mutate(async () => {
        if (remove && existing) {
          if (occurrence) await setException(supabase, existing, occurrence, true);
          else await deleteSchedule(supabase, existing);
        } else if (occurrence && existing) {
          const { validateSchedule } = await import('@/lib/schedule/validation');
          const errors = validateSchedule({ ...draft, recurrence: null, term_end: draft.start_local.slice(0, 10), rdates: [], exdates: [] });
          if (errors.length) throw new Error(errors.join('\n'));
          await setException(supabase, existing, occurrence, false, draft.start_local, draft.end_local);
        } else await saveSchedule(supabase, { ...draft, term_end: draft.recurrence ? draft.term_end : draft.start_local.slice(0, 10) }, existing, clearExceptions);
      });
      router.replace('/calendar');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save.'); setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <Message text="Repeated daylight-saving times use the earlier UTC offset. Times in a skipped hour cannot be saved." />
    <Message text={occurrence ? 'Editing this occurrence only. Its original identity is retained.' : existing?.recurrence ? 'Editing the entire series.' : 'Use local times in the timezone below. End dates for all-day entries are exclusive.'} />
    {!occurrence && <><Field label="Title" value={draft.title} onChange={title => change({ title })} editable={!busy} />
      <Field label="Location" value={draft.location} onChange={location => change({ location })} editable={!busy} />
      <View style={{ flexDirection: 'row', gap: 8 }}><Button label={draft.kind === 'class' ? '✓ Class' : 'Class'} disabled={busy} onPress={() => change({ kind: 'class' })} /><Button label={draft.kind === 'commitment' ? '✓ Commitment' : 'Commitment'} disabled={busy} onPress={() => change({ kind: 'commitment' })} /></View>
      <Field label="Timezone" value={draft.timezone} onChange={value => change({ timezone: value.trim() })} editable={!busy} placeholder="America/New_York" /></>}
    <Field label="Start (YYYY-MM-DDTHH:mm:ss)" value={draft.start_local} onChange={start_local => change({ start_local })} editable={!busy} />
    <Field label="End (YYYY-MM-DDTHH:mm:ss)" value={draft.end_local} onChange={end_local => change({ end_local })} editable={!busy} />
    {!occurrence && <>
      <Button label={draft.all_day ? '✓ All day' : 'Set all day'} disabled={busy} onPress={() => change({ all_day: !draft.all_day })} />
      <Button label={draft.busy ? '✓ Blocks availability' : 'Does not block availability'} disabled={busy} onPress={() => change({ busy: !draft.busy })} />
      <Button label={draft.recurrence ? '✓ Repeats weekly' : 'Repeat weekly'} disabled={busy} onPress={() => change({ recurrence: draft.recurrence ? null : { days: [DateTime.fromISO(draft.start_local, { zone: 'UTC' }).weekday || 1], interval: 1, weekStart: 1, count: null, until: null }, term_end: DateTime.fromISO(draft.start_local, { zone: 'UTC' }).plus({ months: 4 }).toISODate() ?? draft.term_end })} />
      {draft.recurrence && <>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{['Mo','Tu','We','Th','Fr','Sa','Su'].map((day, index) => <Button key={day} label={`${draft.recurrence!.days.includes(index + 1) ? '✓ ' : ''}${day}`} disabled={busy} onPress={() => { const days = draft.recurrence!.days; change({ recurrence: { ...draft.recurrence!, days: days.includes(index + 1) ? days.filter(item => item !== index + 1) : [...days, index + 1].sort() } }); }} />)}</View>
        <Field label="Every N weeks" numeric value={String(draft.recurrence.interval)} onChange={value => change({ recurrence: { ...draft.recurrence!, interval: Number(value) } })} editable={!busy} />
        <Field label="Semester end (YYYY-MM-DD)" value={draft.term_end} onChange={term_end => change({ term_end })} editable={!busy} />
      </>}
      {hasExceptions && <><Message text="Saving the entire series will remove its individual occurrence changes. Choose this only after reviewing those changes in Calendar." /><Button label={clearExceptions ? '✓ Remove occurrence changes when saving' : 'Allow removal of occurrence changes'} disabled={busy} onPress={() => setClearExceptions(!clearExceptions)} /></>}
    </>}
    <Message text={error} error />
    <Button label={busy ? 'Saving…' : 'Save entry'} onPress={() => void perform()} disabled={busy || (!!hasExceptions && !occurrence && !clearExceptions)} />
    {existing && <>
      {!confirmDelete ? <Button label={occurrence ? 'Delete this occurrence' : 'Delete entire entry'} danger disabled={busy} onPress={() => setConfirmDelete(true)} /> : <><Message text={occurrence ? 'This occurrence will be canceled. The other dates remain.' : 'This permanently deletes the series and its occurrence changes.'} /><Button label="Confirm deletion" danger disabled={busy} onPress={() => void perform(true)} /><Button label="Keep entry" disabled={busy} onPress={() => setConfirmDelete(false)} /></>}
      {occurrence && <Button label="Edit entire series" disabled={busy} onPress={() => router.replace({ pathname: '/schedule-entry', params: { id: existing.id } })} />}
    </>}
  </View>;
}
