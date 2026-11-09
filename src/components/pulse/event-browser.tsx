import { useEventPermission } from '@/hooks/use-event-permission';
import { communityRpc } from '@/lib/community';
import { useAuth } from '@/providers/auth-provider';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { PulseColors as C, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { dateOptions, defaultEventFilters, eventCategories, validateEventFilters, type EventFilters } from '@/lib/event-filters';
import { EVENTS_PER_PAGE, fetchEventById, type PulseEvent } from '@/lib/event-query';
import { EventPhoto } from './ui/event-photo';
import { InlineMessage } from './ui/feedback';
import { supabase } from '@/lib/supabase';
import { useEvents } from '@/providers/events-provider';
import { PreviewLink, PulseText, Screen, TitleHeader, usePulseScale } from './ui';
import { EventActions } from './schedule/event-actions';
import { EventDiscussion, VoteButtons } from './community';
import { summaries, type Engagement } from '@/lib/community';
import { ProfileLink, ProfileMessage } from './profile/controls';

function eventDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function EventDate({ value }: { value: string }) {
  return <PulseText size={14} color={C.muted}>{eventDateLabel(value)}</PulseText>;
}

// With a photo, the photo fills the card and the text sits on a scrim at the bottom.
function EventCard({ event }: { event: PulseEvent }) {
  const photo = event.pulse_image_path;
  return <PreviewLink href={{ pathname: '/event', params: { id: event.id } }} label={`Open ${event.title}`} style={[cardStyles.card, photo ? cardStyles.photoCard : null]}>
    {photo && <EventPhoto path={photo} scrim style={StyleSheet.absoluteFill} />}
    <View style={cardStyles.body}>
      <PulseText variant="label" tone="accent">{event.category}</PulseText>
      <PulseText variant="title" numberOfLines={2}>{event.title}</PulseText>
      <PulseText variant="label" tone={photo ? 'default' : 'muted'} numberOfLines={1}>{eventDateLabel(event.event_date)} · {event.location}</PulseText>
    </View>
  </PreviewLink>;
}

const cardStyles = StyleSheet.create({
  card: { borderRadius: PulseRadius.lg, overflow: 'hidden', backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  photoCard: { minHeight: 220, justifyContent: 'flex-end' },
  body: { padding: PulseSpacing.lg, gap: PulseSpacing.xs },
});

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}><PulseText color={C.pink}>{label}</PulseText></Pressable>;
}

export function EventFeed() {
  const s = usePulseScale();
  const { events, filters, loading, error, count, page, changePage, refresh } = useEvents();
  const [scores, setScores] = useState<Record<string, Engagement>>({});
  const [voteError, setVoteError] = useState('');
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  useEffect(() => { let active = true; if (events.length) void summaries('event', events.map(e => e.id)).then(rows => { if (active) { setScores(Object.fromEntries(rows.map(v => [v.id, v]))); setVoteError(''); } }).catch(e => { if (active) setVoteError(e.message); }); return () => { active = false; }; }, [events]);
  return <View style={{ padding: 14 * s, gap: 16 * s }}>
    <PulseText size={18}>{filters.categories.length ? filters.categories.join(', ') : 'All categories'} · {filters.date === 'Pick Date' ? filters.customDate : filters.date}</PulseText>
    {loading ? <ActivityIndicator accessibilityLabel="Loading events" color={C.pink} /> : error ? <View accessibilityRole="alert"><PulseText>{error}</PulseText><TextButton label="Try again" onPress={refresh} /></View> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><PulseText>{count} {count === 1 ? 'event' : 'events'} found</PulseText><TextButton label="Refresh" onPress={refresh} /></View>
      {events.length === 0 && <View style={{ gap: 12 }}><PulseText size={20}>No matching events</PulseText><PulseText color={C.muted}>Try another category or date, or check back later.</PulseText><PreviewLink href="/filters" label="Change filters"><PulseText color={C.pink}>Change filters</PulseText></PreviewLink></View>}
      <ProfileLink href="/clubs" label="Discover clubs" />
      <ProfileMessage error text={voteError} />
      {events.map(event => <View key={event.id} style={{ gap: PulseSpacing.sm }}><EventCard event={event} />{scores[event.id] && <><VoteButtons kind="event" value={scores[event.id]} onChange={value => setScores(previous => ({ ...previous, [event.id]: value }))} /><ProfileLink href={{ pathname: '/event', params: { id: event.id } }} label={`${scores[event.id].comment_count} comments and replies`} /></>}</View>)}
      {count > EVENTS_PER_PAGE && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {page > 0 ? <TextButton label="Previous" onPress={() => changePage(page - 1)} /> : <View />}
        <PulseText size={14}>Page {page + 1} of {Math.ceil(count / EVENTS_PER_PAGE)}</PulseText>
        {(page + 1) * EVENTS_PER_PAGE < count ? <TextButton label="Next" onPress={() => changePage(page + 1)} /> : <View />}
      </View>}
    </>}
  </View>;
}

export function FilterGroup<T extends string>({ title, options, value, onChange }: { title: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
  const s = usePulseScale();
  return <View style={{ gap: 12 * s }}><PulseText size={32}>{title}</PulseText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 * s }}>
    {options.map(option => <Pressable key={option} accessibilityRole="radio" accessibilityLabel={`${title}: ${option}`} accessibilityState={{ checked: value === option }} onPress={() => onChange(option)} style={{ minHeight: 44, minWidth: 80 * s, paddingHorizontal: 14 * s, paddingVertical: 10 * s, borderRadius: 25 * s, borderWidth: 2, borderColor: value === option ? C.pink : C.muted, backgroundColor: value === option ? C.pink : 'transparent', alignItems: 'center', justifyContent: 'center' }}><PulseText size={14} color={value === option ? C.white : C.muted}>{option}</PulseText></Pressable>)}
  </View></View>;
}

function CategoryFilterGroup({ selected, onToggle }: { selected: EventFilters['categories']; onToggle: (category: EventFilters['categories'][number] | null) => void }) {
  const s = usePulseScale();
  const options = ['All', ...eventCategories] as const;
  return <View style={{ gap: 12 * s }}><PulseText size={32}>Category</PulseText><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 * s }}>
    {options.map(option => {
      const checked = option === 'All' ? selected.length === 0 : selected.includes(option);
      return <Pressable key={option} accessibilityRole="checkbox" accessibilityLabel={`Category: ${option}`} accessibilityState={{ checked }} onPress={() => onToggle(option === 'All' ? null : option)} style={{ minHeight: 44, minWidth: 80 * s, paddingHorizontal: 14 * s, paddingVertical: 10 * s, borderRadius: 25 * s, borderWidth: 2, borderColor: checked ? C.pink : C.muted, backgroundColor: checked ? C.pink : 'transparent', alignItems: 'center', justifyContent: 'center' }}><PulseText size={14} color={checked ? C.white : C.muted}>{option}</PulseText></Pressable>;
    })}
  </View></View>;
}

export function EventFiltersScreen() {
  const { filters, applyFilters } = useEvents();
  const [draft, setDraft] = useState(filters);
  const [error, setError] = useState<string | null>(null);
  const update = (changes: Partial<EventFilters>) => { setDraft(current => ({ ...current, ...changes })); setError(null); };
  function apply() {
    const message = validateEventFilters(draft);
    if (message) { setError(message); return; }
    applyFilters(draft);
    router.replace('/search');
  }
  return <Screen header={<TitleHeader title="Filter & sort" close right={<TextButton label="Reset" onPress={() => { setDraft({ ...defaultEventFilters }); setError(null); }} />} />} action="Show Results" onAction={apply}>
    <View style={{ padding: 16, gap: 32 }}>
      <FilterGroup title="Sort" options={['date', 'top'] as const} value={draft.sort ?? 'date'} onChange={sort => update({ sort })} />
      <CategoryFilterGroup selected={draft.categories} onToggle={category => update({ categories: category === null ? [] : draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category] })} />
      <FilterGroup title="Date" options={dateOptions} value={draft.date} onChange={date => update({ date })} />
      {draft.date === 'Pick Date' && <View style={{ gap: 8 }}><PulseText size={14}>Date (YYYY-MM-DD)</PulseText><TextInput accessibilityLabel="Event date, YYYY-MM-DD" value={draft.customDate} onChangeText={customDate => update({ customDate })} placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} maxLength={10} autoCorrect={false} style={{ minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.muted, color: C.white, fontSize: 16 }} /></View>}
      {error && <View accessibilityRole="alert"><PulseText color={C.pink}>{error}</PulseText></View>}
    </View>
  </Screen>;
}

export function SupabaseEventScreen({ id, photoError }: { id: string; photoError?: string }) {
  const { session } = useAuth();
  const [result, setResult] = useState<{ key: string; event: PulseEvent | null; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  useFocusEffect(useCallback(() => { setRevision(value => value + 1); }, []));
  const key = `${id}:${revision}`;
  const current = result?.key === key ? result : null;
  const loading = !current;
  const event = current?.event;
  const allowed = useEventPermission(event, session?.user.id);
  const error = current?.error;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        // Existing discovery/details remain usable before scheduling is deployed.
        const data = await fetchEventById(supabase, id, controller.signal, { allowBasic: true });
        if (active) setResult({ key, event: data, error: data ? null : 'This event is no longer available.' });
      } catch {
        if (active) setResult({ key, event: null, error: 'Unable to load this event. Please try again.' });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [id, key]);
  return <Screen onRefresh={() => setRevision(value => value + 1)} refreshing={loading} header={<TitleHeader title="Event details" right={<TextButton label="Refresh" onPress={() => setRevision(value => value + 1)} />} />}><View style={{ padding: 16, gap: 16 }}>
    <InlineMessage text={photoError ? `Your event was posted, but the photo didn’t upload: ${photoError} You can add it from Edit event.` : null} error />
    {loading ? <ActivityIndicator accessibilityLabel="Loading event" color={C.pink} /> : error ? <View accessibilityRole="alert"><PulseText>{error}</PulseText><TextButton label="Try again" onPress={() => setRevision(value => value + 1)} /></View> : event && <>
      {event.pulse_image_path && <EventPhoto path={event.pulse_image_path} style={{ height: 220, borderRadius: PulseRadius.lg }} />}
      <PulseText color={C.pink}>{event.category}</PulseText><PulseText size={28} font="black">{event.title}</PulseText><EventDate value={event.event_date} /><PulseText>{event.location}</PulseText>
      {!!event.pulse_age_min && <PulseText size={14}>{event.pulse_age_min}+ · Self-reported age eligibility required</PulseText>}
      {event.created_by && <PreviewLink href={{ pathname: '/student-profile', params: { id: event.created_by } }} label="View organizer profile" style={{ minHeight: 48, justifyContent: 'center' }}><PulseText color={C.pink}>View organizer profile ›</PulseText></PreviewLink>}
      {event.pulse_all_day_start && <PulseText size={14}>All day: {event.pulse_all_day_start} through {event.pulse_all_day_end} (exclusive end; {event.pulse_timezone ?? 'UTC'})</PulseText>}
      {event.pulse_starts_at && <PulseText size={14}>{new Date(event.pulse_starts_at).toLocaleString(undefined, { timeZone: event.pulse_timezone ?? 'UTC' })} – {event.pulse_ends_at ? new Date(event.pulse_ends_at).toLocaleString(undefined, { timeZone: event.pulse_timezone ?? 'UTC' }) : 'Time unavailable'} ({event.pulse_timezone ?? 'UTC'})</PulseText>}
      {event.club_id && <ProfileLink href={{ pathname: '/clubs', params: { id: event.club_id } }} label="View hosting club" />}
      {allowed && <PreviewLink href={{ pathname: '/edit-event', params: { id: event.id } }} label="Edit event" style={{ minHeight: 48, justifyContent: 'center' }}><PulseText color={C.pink}>Edit event</PulseText></PreviewLink>}
      {allowed && event.club_id && <TextButton label="Cancel club event" onPress={() => { void communityRpc('cancel_club_event', { p_event: event.id }).then(() => setRevision(v => v + 1)).catch(() => setResult({ key, event, error: 'Unable to cancel club event. Refresh and try again.' })); }} />}
      <EventActions key={String(event.id)} event={event} />
      <EventDiscussion key={`discussion:${session?.user.id}:${event.id}:${revision}`} eventId={event.id} />
    </>}
  </View></Screen>;
}
