import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { PulseColors as C } from '@/constants/pulse-theme';
import { dateOptions, defaultEventFilters, eventCategories, validateEventFilters, type EventFilters } from '@/lib/event-filters';
import { eventColumns, EVENTS_PER_PAGE, type PulseEvent } from '@/lib/event-query';
import { supabase } from '@/lib/supabase';
import { useEvents } from '@/providers/events-provider';
import { PreviewLink, PulseText, Screen, TitleHeader, usePulseScale } from './ui';

function EventDate({ value }: { value: string }) {
  const [year, month, day] = value.split('-').map(Number);
  const localDate = new Date(year, month - 1, day);
  return <PulseText size={14} color={C.muted}>{localDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</PulseText>;
}

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}><PulseText color={C.pink}>{label}</PulseText></Pressable>;
}

export function EventFeed() {
  const s = usePulseScale();
  const { events, filters, loading, error, count, page, changePage, refresh } = useEvents();
  return <View style={{ padding: 14 * s, gap: 16 * s }}>
    <PulseText size={18}>{filters.categories.length ? filters.categories.join(', ') : 'All categories'} · {filters.date === 'Pick Date' ? filters.customDate : filters.date}</PulseText>
    {loading ? <ActivityIndicator accessibilityLabel="Loading events" color={C.pink} /> : error ? <View accessibilityRole="alert"><PulseText>{error}</PulseText><TextButton label="Try again" onPress={refresh} /></View> : <>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><PulseText>{count} {count === 1 ? 'event' : 'events'} found</PulseText><TextButton label="Refresh" onPress={refresh} /></View>
      {events.length === 0 && <View style={{ gap: 12 }}><PulseText size={20}>No matching events</PulseText><PulseText color={C.muted}>Try another category or date, or check back later.</PulseText><PreviewLink href="/filters" label="Change filters"><PulseText color={C.pink}>Change filters</PulseText></PreviewLink></View>}
      {events.map(event => <PreviewLink key={event.id} href={{ pathname: '/event', params: { id: event.id } }} label={`Open ${event.title}`} style={{ borderRadius: 20 * s, overflow: 'hidden', backgroundColor: C.surface }}>
        <View style={{ padding: 16 * s, gap: 8 }}><PulseText size={14} color={C.pink}>{event.category}</PulseText><PulseText size={24} font="black">{event.title}</PulseText><EventDate value={event.event_date} /><PulseText size={14} color={C.muted}>{event.location}</PulseText></View>
      </PreviewLink>)}
      {count > EVENTS_PER_PAGE && <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        {page > 0 ? <TextButton label="Previous" onPress={() => changePage(page - 1)} /> : <View />}
        <PulseText size={14}>Page {page + 1} of {Math.ceil(count / EVENTS_PER_PAGE)}</PulseText>
        {(page + 1) * EVENTS_PER_PAGE < count ? <TextButton label="Next" onPress={() => changePage(page + 1)} /> : <View />}
      </View>}
    </>}
  </View>;
}

function FilterGroup<T extends string>({ title, options, value, onChange }: { title: string; options: readonly T[]; value: T; onChange: (value: T) => void }) {
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
      <CategoryFilterGroup selected={draft.categories} onToggle={category => update({ categories: category === null ? [] : draft.categories.includes(category) ? draft.categories.filter(item => item !== category) : [...draft.categories, category] })} />
      <FilterGroup title="Date" options={dateOptions} value={draft.date} onChange={date => update({ date })} />
      {draft.date === 'Pick Date' && <View style={{ gap: 8 }}><PulseText size={14}>Date (YYYY-MM-DD)</PulseText><TextInput accessibilityLabel="Event date, YYYY-MM-DD" value={draft.customDate} onChangeText={customDate => update({ customDate })} placeholder="YYYY-MM-DD" placeholderTextColor={C.muted} maxLength={10} autoCorrect={false} style={{ minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.muted, color: C.white, fontSize: 16 }} /></View>}
      {error && <View accessibilityRole="alert"><PulseText color={C.pink}>{error}</PulseText></View>}
    </View>
  </Screen>;
}

export function SupabaseEventScreen({ id }: { id: string }) {
  const [result, setResult] = useState<{ key: string; event: PulseEvent | null; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const key = `${id}:${revision}`;
  const current = result?.key === key ? result : null;
  const loading = !current;
  const event = current?.event;
  const error = current?.error;
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    void (async () => {
      try {
        const { data, error: queryError } = await supabase.from('events').select(eventColumns).eq('id', id).abortSignal(controller.signal).maybeSingle<PulseEvent>();
        if (queryError) throw queryError;
        if (active) setResult({ key, event: data, error: data ? null : 'This event is no longer available.' });
      } catch {
        if (active) setResult({ key, event: null, error: 'Unable to load this event. Please try again.' });
      }
    })();
    return () => { active = false; controller.abort(); };
  }, [id, key]);
  return <Screen header={<TitleHeader title="Event details" />}><View style={{ padding: 16, gap: 16 }}>
    {loading ? <ActivityIndicator accessibilityLabel="Loading event" color={C.pink} /> : error ? <View accessibilityRole="alert"><PulseText>{error}</PulseText><TextButton label="Try again" onPress={() => setRevision(value => value + 1)} /></View> : event && <>
      <PulseText color={C.pink}>{event.category}</PulseText><PulseText size={28} font="black">{event.title}</PulseText><EventDate value={event.event_date} /><PulseText>{event.location}</PulseText>
    </>}
  </View></Screen>;
}
