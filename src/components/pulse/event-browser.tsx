import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';

import { PulseColors as C } from '@/constants/pulse-theme';
import { dateOptions, defaultEventFilters, eventCategories, validateEventFilters, type EventFilters } from '@/lib/event-filters';
import { EVENTS_PER_PAGE } from '@/lib/event-query';
import { useEvents } from '@/providers/events-provider';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { PreviewLink, PulseText, Screen, TitleHeader, usePulseScale } from './ui';
import { summaries, type Engagement } from '@/lib/community';
import { ProfileLink, ProfileMessage } from './profile/controls';
import { EventCard } from './event-card';

function TextButton({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, justifyContent: 'center' }}><PulseText color={C.pink}>{label}</PulseText></Pressable>;
}

export function EventFeed() {
  const s = usePulseScale();
  const { events, filters, loading, error, count, page, changePage, refresh } = useEvents();
  const saved = useSavedEvents();
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
      {/* Shown once here; while it's set, every card's bookmark is disabled. */}
      {saved.error && <View><ProfileMessage error text={saved.error} /><TextButton label="Retry saved events" onPress={saved.refresh} /></View>}
      {events.map(event => <EventCard key={event.id} event={event} engagement={scores[event.id]} onEngagementChange={value => setScores(previous => ({ ...previous, [event.id]: value }))} />)}
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
