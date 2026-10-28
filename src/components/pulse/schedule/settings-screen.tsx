import { useLocalSearchParams } from 'expo-router';
import { scheduleSummary } from '@/lib/schedule/editor';
import { EventDateTimeInput } from '../event-date-time-input';
import { useState } from 'react';
import { View } from 'react-native';
import { eventCategories } from '@/lib/event-filters';
import { clearSchedule, deleteImported, savePreferences } from '@/lib/schedule/repository';
import { hasMultipleOccurrences } from '@/lib/schedule/import/review';
import { localTime, validZone } from '@/lib/schedule/time';
import type { SchedulePreferences } from '@/lib/schedule/types';
import { supabase } from '@/lib/supabase';
import { useSchedule } from '@/providers/schedule-provider';
import { Screen, TitleHeader, PulseText, PreviewLink } from '../ui';
import { Button, Disclosure, Field, Loading, Message } from './controls';

export default function ScheduleSettingsScreen() {
  const schedule = useSchedule();
  return <Screen header={<TitleHeader title="Schedule settings" />}><View style={{ padding: 16, gap: 16 }}>
    {schedule.loading ? <Loading /> : schedule.error ? <><Message error text={schedule.error} /><Button label="Retry" onPress={schedule.refresh} /></> : schedule.data && <Preferences key={schedule.data.preferences.version} initial={schedule.data.preferences} />}
  </View></Screen>;
}
function Preferences({ initial }: { initial: SchedulePreferences }) {
  const schedule = useSchedule();
  const { section: requested } = useLocalSearchParams<{ section?: string }>();
  const [section, setSection] = useState(requested === 'preferences' ? 'preferences' : 'entries');
  const [draft, setDraft] = useState(initial), [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [confirmation, setConfirmation] = useState<string | null | undefined>(undefined);
  const [clearConfirmation, setClearConfirmation] = useState(false);
  const [search, setSearch] = useState(''), [page, setPage] = useState(0);
  const entries = (schedule.data?.series ?? []).filter(item => `${item.title} ${item.location}`.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  async function run(remove = false) {
    setBusy(true); setError(null);
    try {
      if (remove) await schedule.mutate(async () => {
        if (clearConfirmation) await clearSchedule(supabase);
        else await deleteImported(supabase, confirmation ?? null);
        // Removal failures remain queued for the scheduled cleanup worker.
        await supabase.functions.invoke('schedule-source', { body: { action: 'cleanup' } }).catch(() => undefined);
      });
      else {
        if (!validZone(draft.timezone) || !localTime(draft.day_start) || !localTime(draft.day_end) || draft.day_end <= draft.day_start || !Number.isInteger(draft.minimum_gap) || draft.minimum_gap < 1 || draft.minimum_gap > 1440) throw new Error('Use a valid timezone, same-day availability hours, and a minimum gap of 1–1440 minutes.');
        await schedule.mutate(user => savePreferences(supabase, user, draft));
      }
      setConfirmation(undefined);
      setClearConfirmation(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 16 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{['entries', 'preferences', 'imports'].map(value => <Button key={value} label={value[0].toUpperCase() + value.slice(1)} selected={section === value} disabled={busy} onPress={() => setSection(value)} />)}</View>
    <Message text={error} error />
    {section === 'preferences' && <>
    <Field label="Schedule display timezone" value={draft.timezone} editable={!busy} onChange={timezone => setDraft({ ...draft, timezone })} />
    <Message text="Changing display timezone does not change the timezone attached to existing classes." />
    <EventDateTimeInput label="Available from" mode="time" value={`2026-01-01T${draft.day_start}:00`} timezone="UTC" disabled={busy} onChange={value => setDraft({ ...draft, day_start: value.slice(11, 16) })} />
    <EventDateTimeInput label="Available until" mode="time" value={`2026-01-01T${draft.day_end}:00`} timezone="UTC" disabled={busy} onChange={value => setDraft({ ...draft, day_end: value.slice(11, 16) })} />
    <Field label="Minimum free window (minutes)" numeric value={String(draft.minimum_gap)} editable={!busy} onChange={value => setDraft({ ...draft, minimum_gap: Number(value) })} />
    <PulseText size={20}>Category interests</PulseText><View style={{ gap: 8 }}>{eventCategories.map(category => <Button key={category} label={`${draft.categories.includes(category) ? '✓ ' : ''}${category}`} disabled={busy} onPress={() => setDraft({ ...draft, categories: draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category] })} />)}</View>
    <Button label="Save preferences" primary disabled={busy} onPress={() => void run()} />
    </>}
    {section === 'entries' && <>
    <PulseText size={20}>Manage schedule entries</PulseText>
    <Field label="Find a class or commitment" value={search} editable={!busy} onChange={value => { setSearch(value); setPage(0); }} />
    <PreviewLink href="/schedule-entry" label="Add a class or commitment"><PulseText>Add entry</PulseText></PreviewLink>
    {!entries.length && <Message text={search ? 'No matching entries.' : 'Your schedule has no classes or commitments.'} />}
    {entries.slice(page * 25, (page + 1) * 25).map(item => <PreviewLink key={item.id} href={{ pathname: '/schedule-entry', params: { id: item.id } }} label={`Edit schedule: ${item.title}`} style={{ padding: 12, gap: 6 }}>
      <PulseText>{item.title}</PulseText><Message text={`${item.kind === 'class' ? 'Class' : 'Commitment'} | ${item.import_id ? 'Imported' : 'Manual'} | ${hasMultipleOccurrences(item) ? 'Repeating' : 'One-off'}\n${scheduleSummary(item)}\n${item.location ? `${item.location} | ` : ''}${item.timezone.replace(/_/g, ' ')}`} />
    </PreviewLink>)}
    {entries.length > 25 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}><Button label="Previous entries" disabled={busy || page === 0} onPress={() => setPage(value => value - 1)} /><Button label="Next entries" disabled={busy || (page + 1) * 25 >= entries.length} onPress={() => setPage(value => value + 1)} /></View>}
    </>}
    {section === 'imports' && <>
    <PreviewLink href="/import-schedule" label="Import schedule" style={{ minHeight: 44, justifyContent: 'center' }}><PulseText>Import schedule</PulseText></PreviewLink>
    <PulseText size={20}>Imported schedules</PulseText>
    {(schedule.data?.imports ?? []).map(batch => <View key={batch.id} style={{ gap: 8 }}><PulseText>{batch.label}</PulseText><Button label={`Delete import: ${batch.label}`} danger disabled={busy} onPress={() => { setClearConfirmation(false); setConfirmation(batch.id); }} /></View>)}
    <Disclosure label="Delete imported schedules">
    <Button label="Delete all imported schedules" danger disabled={busy || !schedule.data?.imports.length} onPress={() => { setClearConfirmation(false); setConfirmation(null); }} />
    </Disclosure>
    {confirmation !== undefined && <><Message text="Permanently remove the selected imported classes and occurrence changes? Manual commitments and Pulse RSVPs remain." /><Button label="Confirm permanent deletion" danger disabled={busy} onPress={() => void run(true)} /><Button label="Keep schedules" disabled={busy} onPress={() => setConfirmation(undefined)} /></>}
    </>}
    <Disclosure label="Destructive actions">
    <Button label="Clear entire schedule" danger disabled={busy} onPress={() => { setConfirmation(undefined); setClearConfirmation(true); }} />
    {clearConfirmation && <><Message text="Permanently delete every imported and manual class or commitment, occurrence change, and import record? Associated uploads will be removed. Your preferences, Pulse RSVPs, and personal-calendar exports remain." /><Button label="Confirm clear entire schedule" danger disabled={busy} onPress={() => void run(true)} /><Button label="Keep entire schedule" disabled={busy} onPress={() => setClearConfirmation(false)} /></>}
    </Disclosure>
  </View>;
}
