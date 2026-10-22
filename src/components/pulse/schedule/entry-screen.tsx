import { router, useLocalSearchParams } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useScheduleConflicts } from '@/hooks/use-schedule-conflicts';
import { hasMultipleOccurrences, occurrenceDraft } from '@/lib/schedule/import/review';
import { deleteSchedule, saveSchedule, setException } from '@/lib/schedule/repository';
import { defaultPreferences, toLocal } from '@/lib/schedule/time';
import { validateSchedule } from '@/lib/schedule/validation';
import type { ScheduleDraft, ScheduleSeries } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { Screen, TitleHeader } from '../ui';
import { Button, Loading, Message } from './controls';
import { DraftFields } from './draft-fields';

export default function ScheduleEntryScreen() {
  const { id, occurrence: requested } = useLocalSearchParams<{ id?: string; occurrence?: string }>();
  const schedule = useSchedule();
  const existing = schedule.data?.series.find(item => item.id === id);
  const occurrence = existing && hasMultipleOccurrences(existing) ? requested : undefined;
  return <Screen header={<TitleHeader title={id ? 'Edit schedule entry' : 'Add a commitment'} />}><View style={{ padding: 16, gap: 16 }}>
    {schedule.loading ? <Loading /> : schedule.error ? <><Message text={schedule.error} error /><Button label="Retry" onPress={schedule.refresh} /></> : id && !existing ? <Message error text="This entry is no longer available. Return to Calendar and refresh." /> : <EntryForm key={`${id ?? 'new'}:${occurrence ?? 'series'}`} existing={existing} occurrence={occurrence} timezone={schedule.data?.preferences.timezone ?? defaultPreferences().timezone} />}
  </View></Screen>;
}

function EntryForm({ existing: loaded, occurrence, timezone }: { existing?: ScheduleSeries; occurrence?: string; timezone: string }) {
  const schedule = useSchedule();
  // Retain the version used to initialize this draft, even if a refresh occurs.
  const [existing] = useState(loaded);
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
  const saving = useRef(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [clearExceptions, setClearExceptions] = useState(false);
  const hasExceptions = !!existing && schedule.data?.exceptions.some(item => item.series_id === existing.id);
  const savingDraft = useMemo(() => occurrence ? occurrenceDraft(draft) : !hasMultipleOccurrences(draft) ? { ...draft, term_end: draft.start_local.slice(0, 10) } : draft, [draft, occurrence]);
  const conflictDrafts = useMemo(() => [{ key: 'entry', draft: savingDraft }], [savingDraft]);
  const exclude = useMemo(() => existing ? { seriesId: existing.id, recurrenceKey: occurrence } : undefined, [existing, occurrence]);
  const conflicts = useScheduleConflicts(conflictDrafts, undefined, exclude);
  const errors = validateSchedule(savingDraft);
  const change = (values: Partial<ScheduleDraft>) => { setDraft(previous => ({ ...previous, ...values })); setError(null); };
  async function perform(remove = false) {
    if (saving.current) return;
    saving.current = true; setBusy(true); setError(null);
    try {
      await schedule.mutate(async () => {
        if (remove && existing) {
          if (occurrence) await setException(supabase, existing, occurrence, true);
          else await deleteSchedule(supabase, existing);
        } else if (occurrence && existing) {
          if (errors.length) throw new Error(errors.join('\n'));
          await setException(supabase, existing, occurrence, false, draft.start_local, draft.end_local);
        } else await saveSchedule(supabase, savingDraft, existing, clearExceptions);
      });
      router.replace('/calendar');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save.'); saving.current = false; setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <Message text="Repeated daylight-saving times use the earlier UTC offset. Times in a skipped hour cannot be saved." />
    <Message text={occurrence ? 'Editing this occurrence only. Its original identity is retained.' : existing && hasMultipleOccurrences(existing) ? 'Editing the entire series.' : 'Editing a single class or commitment.'} />
    {occurrence && existing && <Button label="Edit entire series" disabled={busy} onPress={() => router.replace({ pathname: '/schedule-entry', params: { id: existing.id } })} />}
    <DraftFields draft={draft} onChange={change} disabled={busy} occurrence={!!occurrence} />
    {!occurrence && hasExceptions && <><Message text="Saving this series removes its individual occurrence changes. Review those changes in Calendar before continuing." /><Button label={clearExceptions ? '✓ Remove occurrence changes when saving' : 'Allow removal of occurrence changes'} disabled={busy} onPress={() => setClearExceptions(!clearExceptions)} /></>}
    {errors.map((text, index) => <Message key={index} text={text} error />)}
    {!!conflicts.byKey.entry?.length && <Message text={`Overlaps with ${conflicts.byKey.entry.join(', ')}. You can still save this entry.`} />}
    {!conflicts.complete && <Message text="Conflict check is incomplete. Some schedule or RSVP times are unavailable, invalid, or exceed the comparison limit." />}
    <Message text={error} error />
    {error && <Button label="Reload saved schedule and discard edits" disabled={busy} onPress={schedule.refresh} />}
    <Button label={busy ? 'Saving…' : 'Save entry'} onPress={() => void perform()} disabled={busy || !!errors.length || (!!hasExceptions && !occurrence && !clearExceptions)} />
    {existing && (!confirmDelete ? <Button label={occurrence ? 'Delete this occurrence' : 'Delete entire entry'} danger disabled={busy} onPress={() => setConfirmDelete(true)} /> : <><Message text={occurrence ? 'This occurrence will be canceled. The other dates remain.' : 'This permanently deletes the entry and its occurrence changes.'} /><Button label="Confirm deletion" danger disabled={busy} onPress={() => void perform(true)} /><Button label="Keep entry" disabled={busy} onPress={() => setConfirmDelete(false)} /></>)}
  </View>;
}
