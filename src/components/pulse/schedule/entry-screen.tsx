import { router, useLocalSearchParams } from 'expo-router';
import { DateTime } from 'luxon';
import { useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useScheduleConflicts } from '@/hooks/use-schedule-conflicts';
import { hasMultipleOccurrences, occurrenceDraft } from '@/lib/schedule/import/review';
import { deleteSchedule, saveSchedule, setException } from '@/lib/schedule/repository';
import { defaultPreferences, toLocal } from '@/lib/schedule/time';
import { newScheduleDraft } from '@/lib/schedule/editor';
import { validateSchedule } from '@/lib/schedule/validation';
import type { ScheduleDraft, ScheduleSeries } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { Screen, TitleHeader } from '../ui';
import { Button, Loading, Message } from './controls';
import { DraftFields } from './draft-fields';

export default function ScheduleEntryScreen() {
  const { id, occurrence: requested, date } = useLocalSearchParams<{ id?: string; occurrence?: string; date?: string }>();
  const schedule = useSchedule();
  return <EntryBoundary key={`${schedule.userId}:${id ?? 'new'}:${requested ?? 'series'}`} id={id} requested={requested} date={date} />;
}

function EntryBoundary({ id, requested, date }: { id?: string; requested?: string; date?: string }) {
  const schedule = useSchedule();
  const existing = schedule.data?.series.find(item => item.id === id);
  const occurrence = existing && hasMultipleOccurrences(existing) ? requested : undefined;
  // A background refresh must not unmount an editor and discard its draft.
  const [initialized, setInitialized] = useState<{ existing?: ScheduleSeries; occurrence?: string; timezone: string } | null>(null);
  if (!initialized && !schedule.loading && !schedule.error && (!id || existing)) {
    setInitialized({ existing, occurrence, timezone: schedule.data?.preferences.timezone ?? defaultPreferences().timezone });
  }
  if (initialized) return <EntryForm existing={initialized.existing} occurrence={initialized.occurrence} timezone={initialized.timezone} selectedDate={date} />;
  return <Screen header={<TitleHeader title="Schedule entry" />}><View style={{ padding: 16, gap: 16 }}>{schedule.loading ? <Loading /> : schedule.error ? <><Message text={schedule.error} error /><Button label="Retry" onPress={schedule.refresh} /></> : <Message error text="This entry is no longer available. Return to Calendar and refresh." />}</View></Screen>;
}

function EntryForm({ existing: loaded, occurrence, timezone, selectedDate }: { existing?: ScheduleSeries; occurrence?: string; timezone: string; selectedDate?: string }) {
  const schedule = useSchedule();
  // Retain the version used to initialize this draft, even if a refresh occurs.
  const [existing] = useState(loaded);
  const [draft, setDraft] = useState<ScheduleDraft>(() => {
    if (existing) {
      const exception = schedule.data?.exceptions.find(item => item.series_id === existing.id && item.recurrence_key === occurrence);
      const duration = DateTime.fromISO(existing.end_local, { zone: 'UTC' }).diff(DateTime.fromISO(existing.start_local, { zone: 'UTC' }));
      return { ...existing, ...(occurrence ? { start_local: exception?.start_local ?? occurrence, end_local: exception?.end_local ?? toLocal(DateTime.fromISO(occurrence, { zone: 'UTC' }).plus(duration)) } : {}) };
    }
    return newScheduleDraft(timezone, selectedDate);
  });
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const saving = useRef(false);
  const [focusError, setFocusError] = useState<{ error: string; id: number }>();
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false), [clearExceptions, setClearExceptions] = useState(false);
  const [hasExceptions] = useState(() => !!existing && !!schedule.data?.exceptions.some(item => item.series_id === existing.id));
  const savingDraft = useMemo(() => occurrence ? occurrenceDraft(draft) : !hasMultipleOccurrences(draft) ? { ...draft, term_end: draft.start_local.slice(0, 10) } : draft, [draft, occurrence]);
  const conflictDrafts = useMemo(() => [{ key: 'entry', draft: savingDraft }], [savingDraft]);
  const exclude = useMemo(() => existing ? { seriesId: existing.id, recurrenceKey: occurrence } : undefined, [existing, occurrence]);
  const conflicts = useScheduleConflicts(conflictDrafts, undefined, exclude);
  const errors = validateSchedule(savingDraft);
  const change = (values: Partial<ScheduleDraft>) => { setDraft(previous => ({ ...previous, ...values })); setError(null); setFocusError(undefined); };
  async function perform(remove = false) {
    if (saving.current) return;
    if (!remove && errors.length) { setShowErrors(true); setFocusError(previous => ({ error: errors[0], id: (previous?.id ?? 0) + 1 })); return; }
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
  const saveDisabled = busy || (!!hasExceptions && !occurrence && !clearExceptions);
  return <Screen scroll={false} header={<TitleHeader title={existing ? 'Edit schedule entry' : 'Add an entry'} />}>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 16, gap: 16 }}>
    {(occurrence || (existing && hasMultipleOccurrences(existing))) && <Message text={occurrence ? 'Changes apply to this occurrence only.' : 'Changes apply to the entire series.'} />}
    {occurrence && existing && <Button label="Edit entire series" disabled={busy} onPress={() => router.replace({ pathname: '/schedule-entry', params: { id: existing.id } })} />}
    <DraftFields focusError={focusError} errors={showErrors ? errors : []} onBlur={() => setShowErrors(true)} draft={draft} onChange={change} disabled={busy} occurrence={!!occurrence} />
    {!occurrence && hasExceptions && <><Message text="Saving this series removes its individual occurrence changes. Review those changes in Calendar before continuing." /><Button label={clearExceptions ? '✓ Remove occurrence changes when saving' : 'Allow removal of occurrence changes'} disabled={busy} onPress={() => setClearExceptions(!clearExceptions)} /></>}
    {showErrors && errors.length > 0 && <Message text={errors.join("\n")} error />}
    {!!conflicts.byKey.entry?.length && <Message text={`Overlaps with ${conflicts.byKey.entry.join(', ')}. You can still save this entry.`} />}
    {!conflicts.complete && <Message text="Conflict check is incomplete. Some schedule or RSVP times are unavailable, invalid, or exceed the comparison limit." />}
    <Message text={error} error />
    <Message text={schedule.error} error />

    {existing && (!confirmDelete ? <Button label={occurrence ? 'Delete this occurrence' : 'Delete entire entry'} danger disabled={busy} onPress={() => setConfirmDelete(true)} /> : <><Message text={occurrence ? 'This occurrence will be canceled. The other dates remain.' : 'This permanently deletes the entry and its occurrence changes.'} /><Button label="Confirm deletion" danger disabled={busy} onPress={() => void perform(true)} /><Button label="Keep entry" disabled={busy} onPress={() => setConfirmDelete(false)} /></>)}
    </ScrollView>
    <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#2B303A' }}><Button label={busy ? 'Saving…' : 'Save entry'} primary onPress={() => void perform()} disabled={saveDisabled} /></View>
    </KeyboardAvoidingView>
  </Screen>;
}
