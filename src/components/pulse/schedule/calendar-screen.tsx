import { useFocusEffect } from 'expo-router';
import { DateTime } from 'luxon';
import { useCallback, useEffect, useState } from 'react';
import { AppState, FlatList, Pressable, View } from 'react-native';
import { PulseColors as C } from '@/constants/pulse-theme';
import { useCalendarEntries } from '@/hooks/use-calendar-entries';
import { fetchCalendarCandidates, type PulseEvent } from '@/lib/event-query';
import { freeWindows } from '@/lib/schedule/availability';
import { rankEvents } from '@/lib/schedule/recommendations';
import { defaultPreferences } from '@/lib/schedule/time';
import { hasMultipleOccurrences } from '@/lib/schedule/import/review';
import { scheduleError } from '@/lib/schedule/repository';
import { setRSVP } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';
import { useEvents } from '@/providers/events-provider';
import { useSchedule } from '@/providers/schedule-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import { PreviewLink, PulseText, Screen, TitleHeader } from '../ui';
import { Button, Disclosure, Loading, Message } from './controls';

export default function CalendarScreen() {
  const schedule = useSchedule(), rsvps = useRSVPs();
  const preferences = schedule.data?.preferences ?? defaultPreferences();
  const zone = preferences.timezone;
  const [selected, setSelected] = useState(() => DateTime.now().setZone(zone).toISODate()!);
  const [menu, setMenu] = useState(false);
  const [rsvpError, setRSVPError] = useState<string | null>(null), [canceling, setCanceling] = useState(false);
  async function cancelUnavailable(eventId: string) {
    setCanceling(true); setRSVPError(null);
    try { await rsvps.mutate(userId => setRSVP(supabase, userId, eventId, 'cancelled')); }
    catch (reason) { setRSVPError(scheduleError(reason)); }
    finally { setCanceling(false); }
  }
  const day = DateTime.fromISO(selected, { zone }).startOf('day');
  const first = day.startOf('week');
  const range = { start: first.toMillis(), end: first.plus({ days: 7 }).toMillis() };
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
    ...calendar.occurrences.map(item => ({ id: item.id, title: item.title, location: item.location, start: item.start, end: item.end, allDay: item.allDay, href: { pathname: '/schedule-entry' as const, params: { id: item.seriesId, ...(schedule.data?.series.some(series => series.id === item.seriesId && hasMultipleOccurrences(series)) ? { occurrence: item.recurrenceKey } : {}) } }, kind: item.kind })),
    ...calendar.events.map(item => ({ id: `event:${item.event.id}`, title: item.event.title, location: item.event.location, start: item.start, end: item.end, allDay: !!item.event.pulse_all_day_start, href: { pathname: '/event' as const, params: { id: String(item.event.id) } }, kind: 'Pulse event' })),
  ].filter(item => item.start < selectedRange.end && selectedRange.start < item.end).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const windows = calendar.complete ? freeWindows(calendar.busy, {
    start: DateTime.fromISO(`${selected}T${preferences.day_start}`, { zone }).toMillis(),
    end: DateTime.fromISO(`${selected}T${preferences.day_end}`, { zone }).toMillis(),
  }, preferences.minimum_gap) : [];
  const format = (value: number) => DateTime.fromMillis(value, { zone }).toFormat('ccc h:mm a');
  return <Screen scroll={false} header={<TitleHeader title="Your calendar" right={<Button label="Schedule" expanded={menu} onPress={() => setMenu(!menu)} />} />} bottomBar activeTab="calendar">
    <FlatList refreshing={calendar.loading} onRefresh={refresh} data={entries} keyExtractor={item => item.id} contentContainerStyle={{ padding: 16, gap: 12 }}
      ListHeaderComponent={<View style={{ gap: 12, paddingBottom: 12 }}>
        {menu && <View style={{ gap: 8 }}>
          <PreviewLink href="/import-schedule" label="Import schedule" style={{ minHeight: 44, justifyContent: 'center' }}><PulseText>Import schedule</PulseText></PreviewLink>
          <PreviewLink href={{ pathname: '/schedule-settings', params: { section: 'entries' } }} label="Manage entries" style={{ minHeight: 44, justifyContent: 'center' }}><PulseText>Manage entries</PulseText></PreviewLink>
          <PreviewLink href={{ pathname: '/schedule-settings', params: { section: 'preferences' } }} label="Schedule preferences" style={{ minHeight: 44, justifyContent: 'center' }}><PulseText>Preferences</PulseText></PreviewLink>
        </View>}
        <PulseText size={20}>{day.toFormat('MMMM yyyy')}</PulseText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 6 }}>
          <Button label="Previous week" onPress={() => setSelected(day.minus({ days: 7 }).toISODate()!)} />
          <Button label="Today" onPress={() => setSelected(DateTime.now().setZone(zone).toISODate()!)} />
          <Button label="Next week" onPress={() => setSelected(day.plus({ days: 7 }).toISODate()!)} />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 2 }}>
          {Array.from({ length: 7 }, (_, index) => {
            const date = first.plus({ days: index }), start = date.toMillis(), end = date.plus({ days: 1 }).toMillis();
            const count = [...calendar.occurrences, ...calendar.events].filter(item => item.start < end && start < item.end).length;
            const active = date.toISODate() === selected;
            return <Pressable key={index} accessibilityRole="button" accessibilityLabel={`${date.toFormat('cccc, MMMM d')}, ${count} ${count === 1 ? 'entry' : 'entries'}`} accessibilityState={{ selected: active }} onPress={() => setSelected(date.toISODate()!)} style={{ flex: 1, minWidth: 44, minHeight: 80, paddingVertical: 10, paddingHorizontal: 2, gap: 4, borderRadius: 12, alignItems: 'center', backgroundColor: active ? C.pink : C.surface }}>
              <PulseText size={12}>{date.toFormat('ccc')}</PulseText><PulseText size={18}>{date.day}</PulseText><PulseText size={11}>{count}</PulseText>
            </Pressable>;
          })}
        </View>
        <PreviewLink href={{ pathname: '/schedule-entry', params: { date: selected } }} label="Add a class or commitment" style={{ minHeight: 48, padding: 12, borderRadius: 14, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}><PulseText>Add entry</PulseText></PreviewLink>
        <Message text={calendar.error} error />{calendar.error && <Button label="Retry calendar" onPress={refresh} />}{calendar.loading && <Loading />}
        {!!calendar.unknown.length && <Message text={`${calendar.unknown.length} RSVP(s) have unknown times or are unavailable. Availability cannot be confirmed.`} />}
        <PulseText size={20}>{day.toFormat('cccc, MMMM d')}</PulseText><Message text={`Times in ${zone.replace(/_/g, ' ')}`} />
      </View>}
      renderItem={({ item }) => <PreviewLink href={item.href} label={`Open ${item.title}`} style={{ backgroundColor: C.surface, padding: 14, borderRadius: 14, flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 80, gap: 4 }}><PulseText size={14}>{item.allDay ? 'All day' : DateTime.fromMillis(item.start, { zone }).toLocaleString(DateTime.TIME_SIMPLE)}</PulseText>{!item.allDay && <Message text={DateTime.fromMillis(item.end, { zone }).toFormat(item.end > selectedRange.end ? 'ccc h:mm a' : 'h:mm a')} />}</View>
        <View style={{ flex: 1, gap: 6 }}><PulseText size={20}>{item.title}</PulseText><Message text={item.location} /><Message text={item.kind} /></View>
      </PreviewLink>}
      ListEmptyComponent={!calendar.loading && !calendar.error ? <Message text="No entries on this day. Add a class, commitment, or RSVP to a Pulse event." /> : null}
      ListFooterComponent={<View style={{ gap: 14, paddingTop: 16 }}>
        {calendar.unknown.map(item => <View key={String(item.event_id)} style={{ gap: 8 }}><PreviewLink href={{ pathname: '/event', params: { id: String(item.event_id) } }} label="Open RSVP with unknown time"><PulseText>{item.event?.title ?? 'Unavailable RSVP'}</PulseText></PreviewLink><Message text="Time unavailable. Review this RSVP before relying on free-time suggestions." /><Button label={`Cancel RSVP: ${item.event?.title ?? 'unavailable event'}`} disabled={canceling} onPress={() => void cancelUnavailable(String(item.event_id))} /></View>)}
        <Message text={rsvpError} error />
        {!calendar.complete && <Message text="Availability is not confirmed until your schedule and RSVP times are loaded successfully." />}
        <Disclosure label="Available time" summary={calendar.complete ? `${windows.length} free ${windows.length === 1 ? 'window' : 'windows'} today` : 'Availability is not confirmed'}>
        {!calendar.complete ? <Message text="Load a complete schedule and known RSVP times to calculate availability." /> : windows.length ? windows.map(window => <Message key={window.start} text={`${format(window.start)} – ${format(window.end)}`} />) : <Message text="No free windows meet your preferences on this day." />}
        {calendar.complete && <Message text="Available time reflects your saved schedule and going RSVPs; it does not include other device calendars." />}
        </Disclosure>
        <Disclosure label="Activities this week"><Recommendations start={range.start} end={range.end} calendar={calendar} /></Disclosure>
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
