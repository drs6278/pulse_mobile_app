import { useState } from 'react';
import { View } from 'react-native';
import { eventCategories } from '@/lib/event-filters';
import { deleteImported, savePreferences } from '@/lib/schedule/repository';
import { localTime, validZone } from '@/lib/schedule/time';
import type { SchedulePreferences } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { Screen, TitleHeader, PulseText } from '../ui';
import { Button, Field, Loading, Message } from './controls';

export default function ScheduleSettingsScreen() {
  const schedule = useSchedule();
  return <Screen header={<TitleHeader title="Schedule settings" />}><View style={{ padding: 16, gap: 16 }}>
    {schedule.loading ? <Loading /> : schedule.error ? <><Message error text={schedule.error} /><Button label="Retry" onPress={schedule.refresh} /></> : schedule.data && <Preferences key={schedule.data.preferences.version} initial={schedule.data.preferences} />}
  </View></Screen>;
}
function Preferences({ initial }: { initial: SchedulePreferences }) {
  const schedule = useSchedule();
  const [draft, setDraft] = useState(initial), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null | undefined>(undefined);
  async function run(remove = false) {
    setBusy(true); setError(null);
    try {
      if (remove) await schedule.mutate(() => deleteImported(supabase, confirmation ?? null));
      else {
        if (!validZone(draft.timezone) || !localTime(draft.day_start) || !localTime(draft.day_end) || draft.day_end <= draft.day_start || !Number.isInteger(draft.minimum_gap) || draft.minimum_gap < 1 || draft.minimum_gap > 1440) throw new Error('Use a valid timezone, same-day availability hours, and a minimum gap of 1–1440 minutes.');
        await schedule.mutate(user => savePreferences(supabase, user, draft));
      }
      setConfirmation(undefined);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <Field label="Schedule display timezone" value={draft.timezone} editable={!busy} onChange={timezone => setDraft({ ...draft, timezone })} />
    <Message text="Changing display timezone does not change the timezone attached to existing classes." />
    <Field label="Available from (HH:mm)" value={draft.day_start} editable={!busy} onChange={day_start => setDraft({ ...draft, day_start })} />
    <Field label="Available until (HH:mm)" value={draft.day_end} editable={!busy} onChange={day_end => setDraft({ ...draft, day_end })} />
    <Field label="Minimum free window (minutes)" numeric value={String(draft.minimum_gap)} editable={!busy} onChange={value => setDraft({ ...draft, minimum_gap: Number(value) })} />
    <PulseText size={20}>Category interests</PulseText><View style={{ gap: 8 }}>{eventCategories.map(category => <Button key={category} label={`${draft.categories.includes(category) ? '✓ ' : ''}${category}`} disabled={busy} onPress={() => setDraft({ ...draft, categories: draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category] })} />)}</View>
    <Message text={error} error /><Button label="Save preferences" disabled={busy} onPress={() => void run()} />
    <PulseText size={20}>Imported schedules</PulseText>
    {(schedule.data?.imports ?? []).map(batch => <View key={batch.id} style={{ gap: 8 }}><PulseText>{batch.label}</PulseText><Button label={`Delete import: ${batch.label}`} danger disabled={busy} onPress={() => setConfirmation(batch.id)} /></View>)}
    <Button label="Delete all imported schedules" danger disabled={busy || !schedule.data?.imports.length} onPress={() => setConfirmation(null)} />
    {confirmation !== undefined && <><Message text="Permanently remove the selected imported classes and occurrence changes? Manual commitments and Pulse RSVPs remain." /><Button label="Confirm permanent deletion" danger disabled={busy} onPress={() => void run(true)} /><Button label="Keep schedules" disabled={busy} onPress={() => setConfirmation(undefined)} /></>}
  </View>;
}
