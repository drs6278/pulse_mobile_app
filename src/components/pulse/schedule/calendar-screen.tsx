import { useFocusEffect } from 'expo-router';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import { AppState, FlatList, Pressable, ScrollView, View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { useCalendarEntries } from '@/hooks/use-calendar-entries';
import { fetchCalendarCandidates, type PulseEvent } from '@/lib/event-query';
import { freeWindows } from '@/lib/schedule/availability';
import { rankEvents } from '@/lib/schedule/recommendations';
import { defaultPreferences } from '@/lib/schedule/time';
import { scheduleError } from '@/lib/schedule/repository';
import { setRSVP } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';
import { useEvents } from '@/providers/events-provider';
import { useSchedule } from '@/providers/schedule-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import { PreviewLink, PulseText, Screen, TitleHeader } from '../ui';
import { Button, Loading, Message } from './controls';

export default function CalendarScreen() {
  const schedule = useSchedule(), rsvps = useRSVPs();
  const preferences = schedule.data?.preferences ?? defaultPreferences();
  const zone = preferences.timezone;
  const [selected, setSelected] = useState(() => DateTime.now().setZone(zone).toISODate()!);
  const [mode, setMode] = useState<'day' | 'week'>('week');
  const [rsvpError, setRSVPError] = useState<string | null>(null), [canceling, setCanceling] = useState(false);
  async function cancelUnavailable(eventId: string) {
    setCanceling(true); setRSVPError(null);
    try { await rsvps.mutate(userId => setRSVP(supabase, userId, eventId, 'cancelled')); }
    catch (reason) { setRSVPError(scheduleError(reason)); }
    finally { setCanceling(false); }
  }
  const day = DateTime.fromISO(selected, { zone }).startOf('day');
  const first = mode === 'week' ? day.startOf('week') : day;
  const range = { start: first.toMillis(), end: first.plus({ days: mode === 'week' ? 7 : 1 }).toMillis() };
  const calendar = useCalendarEntries(range);
  const refreshSchedule = schedule.refresh, refreshRSVPs = rsvps.refresh;
  const refresh = useCallback(() => { refreshSchedule(); refreshRSVPs(); }, [refreshSchedule, refreshRSVPs]);
  useFocusEffect(useCallback(() => {
    refresh();
    const timer = setInterval(() => { if (AppState.currentState === 'active') refresh(); }, 60000);
    return () => clearInterval(timer);
  }, [refresh]));
  const selectedRange = { start: day.toMillis(), end: day.plus({ days: 1 }).toMillis() };
  const entries = [
    ...calendar.occurrences.map(item => ({ id: item.id, title: item.title, location: item.location, start: item.start, end: item.end, allDay: item.allDay, href: { pathname: '/schedule-entry' as const, params: { id: item.seriesId, occurrence: item.recurrenceKey } }, kind: item.kind })),
    ...calendar.events.map(item => ({ id: `event:${item.event.id}`, title: item.event.title, location: item.event.location, start: item.start, end: item.end, allDay: !!item.event.pulse_all_day_start, href: { pathname: '/event' as const, params: { id: String(item.event.id) } }, kind: 'Pulse event' })),
  ].filter(item => item.start < selectedRange.end && selectedRange.start < item.end).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const windows = calendar.complete ? freeWindows(calendar.busy, {
    start: DateTime.fromISO(`${selected}T${preferences.day_start}`, { zone }).toMillis(),
    end: DateTime.fromISO(`${selected}T${preferences.day_end}`, { zone }).toMillis(),
  }, preferences.minimum_gap) : [];
  const format = (value: number) => DateTime.fromMillis(value, { zone }).toFormat('ccc h:mm a');
  return <Screen scroll={false} header={<TitleHeader title="Your calendar" right={<PreviewLink href="/schedule-settings" label="Schedule settings"><PulseText size={14}>Settings</PulseText></PreviewLink>} />} bottomBar activeTab="calendar">
    <FlatList data={entries} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 12 }}>
        <PulseText size={20}>{day.toFormat('MMMM d, yyyy')}</PulseText><Message text={`Times in ${zone}. Refresh checks for changes from other devices.`} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 6 }}>
          <Button label="Previous" onPress={() => setSelected(day.minus({ days: mode === 'week' ? 7 : 1 }).toISODate()!)} />
          <Button label="Today" onPress={() => setSelected(DateTime.now().setZone(zone).toISODate()!)} />
          <Button label="Next" onPress={() => setSelected(day.plus({ days: mode === 'week' ? 7 : 1 }).toISODate()!)} />
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}><Button label={mode === 'day' ? '✓ Day' : 'Day'} onPress={() => setMode('day')} /><Button label={mode === 'week' ? '✓ Week' : 'Week'} onPress={() => setMode('week')} /><Button label="Refresh" onPress={refresh} /></View>
        {mode === 'week' && <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 2 }}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = first.plus({ days: index }), start = date.toMillis(), end = date.plus({ days: 1 }).toMillis();
            const count = [...calendar.occurrences, ...calendar.events].filter(item => item.start < end && start < item.end).length;
            const active = date.toISODate() === selected;
            return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${date.toFormat('cccc, MMMM d')}, ${count} ${count === 1 ? 'entry' : 'entries'}`} accessibilityState={{ selected: active }} onPress={() => setSelected(date.toISODate()!)} style={{ width: 44, minHeight: 80, paddingVertical: 10, paddingHorizontal: 2, gap: 4, borderRadius: 12, alignItems: 'center', backgroundColor: active ? C.pink : C.surface }}>
              <PulseText size={12}>{date.toFormat('ccc')}</PulseText><PulseText size={18}>{date.day}</PulseText><PulseText size={11}>{count}</PulseText>
            </Pressable>;
          })}
        </ScrollView>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
          <PreviewLink href="/schedule-entry" label="Add a class or commitment" style={{ minHeight: 44, justifyContent: 'center' }}><PulseText>Add entry</PulseText></PreviewLink>
          <PreviewLink href="/import-schedule" label="Import schedule" style={{ minHeight: 44, justifyContent: 'center' }}><PulseText>Import</PulseText></PreviewLink>
        </View>
        <Message text={calendar.error} error />{calendar.loading && <Loading />}
        {!!calendar.unknown.length && <Message text={`${calendar.unknown.length} RSVP(s) have unknown times or are unavailable. Availability cannot be confirmed.`} />}
        <PulseText size={20}>Selected day</PulseText>
      </View>}
      renderItem={({ item }) => <PreviewLink href={item.href} label={`Open ${item.title}`} style={{ backgroundColor: '#20242D', padding: 14, borderRadius: 14, gap: 6 }}>
        <PulseText size={13}>{item.kind}</PulseText><PulseText size={20}>{item.title}</PulseText><Message text={item.allDay ? 'All day' : `${format(item.start)} – ${format(item.end)}`} /><Message text={item.location} />
      </PreviewLink>}
      ListEmptyComponent={!calendar.loading && !calendar.error ? <Message text="No entries on this day. Add a class, commitment, or RSVP to a Pulse event." /> : null}
      ListFooterComponent={<View style={{ gap: 14, paddingTop: 16 }}>
        {calendar.unknown.map(item => <View key={String(item.event_id)} style={{ gap: 8 }}><PreviewLink href={{ pathname: '/event', params: { id: String(item.event_id) } }} label="Open RSVP with unknown time"><PulseText>{item.event?.title ?? 'Unavailable RSVP'}</PulseText></PreviewLink><Message text="Time unavailable. Review this RSVP before relying on free-time suggestions." /><Button label={`Cancel RSVP: ${item.event?.title ?? 'unavailable event'}`} disabled={canceling} onPress={() => void cancelUnavailable(String(item.event_id))} /></View>)}
        <Message text={rsvpError} error />
        <PulseText size={20}>Available time</PulseText>
        {!calendar.complete ? <Message text="Load a complete schedule and known RSVP times to calculate availability." /> : windows.length ? windows.map(window => <Message key={window.start} text={`${format(window.start)} – ${format(window.end)}`} />) : <Message text="No free windows meet your preferences on this day." />}
        {calendar.complete && <Message text="Available time reflects your saved schedule and going RSVPs; it does not include other device calendars." />}
        <Recommendations start={range.start} end={range.end} calendar={calendar} />
      </View>} />
  </Screen>;
}
function Recommendations({ start, end, calendar }: { start: number; end: number; calendar: ReturnType<typeof useCalendarEntries> }) {
  const schedule = useSchedule(), rsvps = useRSVPs(), discovery = useEvents();
  const [fitsOnly, setFitsOnly] = useState(true);
  const key = `${schedule.userId}:${start}:${end}`;
  const [result, setResult] = useState<{ key: string; events: PulseEvent[]; error: string | null } | null>(null);
  useEffect(() => {
    const controller = new AbortController(); let active = true;
    void fetchCalendarCandidates(supabase, new Date(start).toISOString(), new Date(end).toISOString(), controller.signal)
      .then(events => { if (active) setResult({ key, events, error: null }); })
      .catch(error => { if (active) setResult({ key, events: [], error: scheduleError(error) }); });
    return () => { active = false; controller.abort(); };
  }, [key, start, end, schedule.data, rsvps.data]);
  const current = result?.key === key ? result : null;
  const candidates = rankEvents((current?.events ?? []).filter(event => !discovery.filters.categories.length || discovery.filters.categories.includes(event.category as typeof discovery.filters.categories[number])), calendar.busy, calendar.complete && !!current && !current.error, schedule.data?.preferences.categories ?? [], (rsvps.data ?? []).filter(item => item.status === 'going').map(item => String(item.event_id)), fitsOnly);
  return <View style={{ gap: 10 }}><PulseText size={20}>Activities this {end - start > 2 * 86400000 ? 'week' : 'day'}</PulseText>
    <Message text="Uses your current category filter and category interests. Events without verified times are omitted." />
    <Button label={fitsOnly ? '✓ Fits my schedule only' : 'Show all compatibility levels'} onPress={() => setFitsOnly(!fitsOnly)} />
    {!current ? <Loading /> : current.error ? <Message error text={current.error} /> : <>
      {!calendar.complete && <Message text="Compatibility is unknown until your schedule and RSVPs finish loading successfully." />}
      {!candidates.length && <Message text="No matching activities in this range." />}
      {candidates.slice(0, 20).map(item => <PreviewLink key={String(item.event.id)} href={{ pathname: '/event', params: { id: String(item.event.id) } }} label={`Open ${item.event.title}`} style={{ padding: 12, backgroundColor: '#20242D', borderRadius: 12 }}><PulseText>{item.event.title}</PulseText><Message text={`${item.event.category} · ${item.compatibility}`} /></PreviewLink>)}
      {candidates.length > 20 && <Message text={`Showing the top 20 of ${candidates.length} ranked activities.`} />}
    </>}
  </View>;
}
