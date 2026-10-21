import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PulseColors as C, PulseImages as Images } from '@/constants/pulse-theme';
import { eventCategories } from '@/lib/event-filters';
import { useEvents } from '@/providers/events-provider';
import { EventFeed, EventFiltersScreen, SupabaseEventScreen } from './event-browser';
import {
  EventRow, Photo, PreviewLink, PulseIcon, PulseText, Screen,
  SearchHeader, Tag, TitleHeader, usePulseScale,
} from './ui';

export function HomeScreen() {
  return <Screen header={<SearchHeader home />} bottomBar activeTab="home"><EventFeed /></Screen>;
}

export function CategoriesScreen() {
  return <Screen header={<TitleHeader title="Browse Categories" close />}><CategoriesContent /></Screen>;
}

function CategoriesContent() {
  const s = usePulseScale();
  const { filters, applyFilters } = useEvents();
  return <View style={{ paddingLeft: 18 * s, paddingRight: 14 * s, paddingTop: 12 * s, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 * s, rowGap: 25 * s }}>
    {eventCategories.map(category => <Pressable key={category} accessibilityRole="button" accessibilityLabel={`Browse ${category} events`} onPress={() => { applyFilters({ ...filters, categories: [category] }); router.navigate('/search'); }}>
      <Photo source={Images.categories} width={175} height={175}><View style={{ position: 'absolute', left: 7 * s, bottom: 7 * s }}><PulseText font="black" size={24} lineHeight={32}>{category}</PulseText></View></Photo>
    </Pressable>)}
  </View>;
}

export const FiltersScreen = EventFiltersScreen;

export function SearchScreen() {
  return <Screen header={<SearchHeader />} bottomBar activeTab="home"><EventFeed /></Screen>;
}

export function SavedScreen() {
  return <Screen header={<SearchHeader />} bottomBar activeTab="saved"><SavedContent /></Screen>;
}

function SavedContent() {
  const s = usePulseScale();
  return <View style={{ paddingHorizontal: 10 * s, paddingTop: 24 * s }}>
    <PulseText font="black" size={24} lineHeight={32} style={{ marginLeft: 4 * s }}>Saved Events</PulseText>
    <View style={{ marginTop: 23 * s }}>
      <EventRow title="Food" image={Images.saved} saved />
      <EventRow title="Concert" image={Images.saved} saved />
    </View>
  </View>;
}

function EventInfo({ map = false }: { map?: boolean }) {
  const s = usePulseScale();
  return <View style={{ height: (map ? 195 : 250) * s, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.muted, paddingTop: 9 * s, paddingLeft: 11 * s, flexDirection: 'row', gap: 15 * s }}>
    <Photo source={map ? Images.mapEvent : Images.basketball} width={175} height={175}><View style={{ position: 'absolute', left: 12 * s, top: 12 * s }}><Tag label="Sports" /></View></Photo>
    <View style={{ flex: 1, paddingTop: 11 * s }}>
      <PulseText size={24} color={C.white} lineHeight={29}>Basketball</PulseText>
      <PulseText size={16} color={C.white} lineHeight={29} style={{ marginTop: 6 * s }}>9:00pm - Junker</PulseText>
    </View>
    {map ? <>
      <View style={{ position: 'absolute', right: 11 * s, top: 21 * s }}><PreviewLink href="/event" label="Open basketball details"><PulseIcon name="next" size={48} /></PreviewLink></View>
      <View accessibilityLabel="Saved event" style={{ position: 'absolute', right: 16 * s, bottom: 10 * s }}><PulseIcon name="bookmarkFilled" color={C.pink} /></View>
    </> : <View style={{ position: 'absolute', right: 17 * s, bottom: 17 * s }}><PreviewLink href="/map" label="Preview event map"><PulseIcon name="map" size={48} /></PreviewLink></View>}
  </View>;
}

export function EventScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  if (eventId) return <SupabaseEventScreen id={eventId} />;
  return <Screen header={<TitleHeader title="Pick up Basketball" right={<PulseIcon name="bookmarkFilled" color={C.pink} />} />} action="RSVP"><EventContent /></Screen>;
}

function EventContent() {
  const s = usePulseScale();
  return <View><EventInfo />
    <View style={{ marginTop: 36 * s, paddingHorizontal: 14 * s }}>
      <PulseText size={24} color={C.white} lineHeight={29}>About this event</PulseText>
      <PulseText size={16} color={C.white} lineHeight={20} style={{ marginTop: 24 * s }}>Playing a 5v5 pick up basketball game at junker</PulseText>
      <PulseText size={16} color={C.white} lineHeight={20} style={{ marginTop: 24 * s }}>Hosted by: Davis</PulseText>
    </View>
  </View>;
}

export function CreateScreen() {
  return <Screen header={<SearchHeader />} bottomBar activeTab="create"><CreateContent /></Screen>;
}

function StaticField({ label }: { label: string }) {
  const s = usePulseScale();
  return <View accessibilityLabel={`${label}: Input, read only`} style={{ width: 210 * s, height: 56 * s, borderBottomWidth: 1, borderColor: '#49454F', paddingHorizontal: 16 * s, paddingTop: 8 * s }}>
    <Text style={{ color: C.white, fontSize: 12 * s, letterSpacing: 0.4 * s }}>{label}</Text>
    <Text style={{ color: C.white, fontSize: 16 * s, letterSpacing: 0.5 * s, marginTop: 2 * s }}>Input</Text>
    <View style={{ position: 'absolute', right: 12 * s, top: 16 * s }}><PulseIcon name="clear" size={24} color={C.white} /></View>
  </View>;
}

function CreateContent() {
  const s = usePulseScale();
  return <View style={{ paddingTop: 27 * s, alignItems: 'center' }}>
    <PulseText font="black" size={24} color={C.white} lineHeight={32}>Create an Event</PulseText>
    <View style={{ marginTop: 24 * s, gap: 35 * s, transform: [{ translateX: -10 * s }] }}><StaticField label="Title" /><StaticField label="Location" /><StaticField label="Time" /></View>
    <View style={{ marginTop: 35 * s, width: 250 * s, height: 200 * s, transform: [{ translateX: -10 * s }] }}>
      <Text style={{ color: C.white, fontSize: 14 * s, marginLeft: 24 * s, marginTop: 18 * s }}>Select date</Text>
      <View style={{ marginTop: 39 * s, paddingBottom: 12 * s, paddingHorizontal: 24 * s, borderBottomWidth: 1, borderColor: '#CAC4D0', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}><Text style={{ color: C.white, fontSize: 32 * s }}>Enter date</Text><PulseIcon name="date" size={24} color={C.white} /></View>
      <View style={{ marginTop: 18 * s, marginHorizontal: 24 * s, height: 56 * s, borderWidth: 3 * s, borderTopLeftRadius: 4 * s, borderTopRightRadius: 4 * s, borderColor: C.muted, paddingHorizontal: 12 * s, justifyContent: 'center' }}>
        <Text style={{ position: 'absolute', top: -9 * s, left: 9 * s, backgroundColor: C.background, paddingHorizontal: 4 * s, color: C.muted, fontSize: 12 * s }}>Date</Text><Text style={{ color: '#1D1B20', fontSize: 16 * s }}>mm/dd/yyyy</Text>
      </View>
    </View>
  </View>;
}

export function MapScreen() {
  return <Screen header={<TitleHeader title="Map" />} action="Get Directions" overlay={<MapGridOverlay />}><MapContent /></Screen>;
}

function MapGridOverlay() {
  const s = usePulseScale();
  const insets = useSafeAreaInsets();
  return <Image pointerEvents="none" source={Images.mapGrid} style={{ position: 'absolute', top: insets.top + 5 * s, left: 14 * s, width: 360 * s, height: 360 * s, opacity: 0.5 }} contentFit="cover" />;
}

function MapContent() {
  const s = usePulseScale();
  return <View>
    <View style={{ marginTop: 10 * s, marginLeft: 28 * s, width: 345 * s, height: 248 * s, borderRadius: 25 * s, borderWidth: 3 * s, borderColor: C.border, overflow: 'hidden' }}>
      <Image source={Images.map} style={{ position: 'absolute', left: '-27.82%', top: 0, width: '130.47%', height: '124.55%' }} contentFit="fill" />
      <View style={{ position: 'absolute', top: 73 * s, left: 103 * s }}><PulseIcon name="pinPink" size={48} color={C.pink} /></View>
    </View>
    <View style={{ marginTop: 22 * s, marginLeft: 36 * s, height: 48 * s, flexDirection: 'row', alignItems: 'center', gap: 16 * s }}><PulseIcon name="pin" size={48} /><PulseText size={16} color={C.white} lineHeight={20}>Junker main gym</PulseText></View>
    <View style={{ marginTop: 22 * s, marginRight: 6 * s }}><EventInfo map /></View>
  </View>;
}

const previews = [
  ['/', 'Home Dashboard'], ['/categories', 'Browse Categories'], ['/filters', 'Filter & Sort'],
  ['/search', 'Search Results'], ['/saved', 'Saved Events'], ['/event', 'Event Details'],
  ['/create', 'Create Event'], ['/import-schedule', 'Import Schedule'], ['/map', 'Map'], ['/calendar', 'Calendar'],
  ['/settings', 'Settings'],
] as const;

export function ScreensIndex() {
  return <Screen header={<TitleHeader title="Screen previews" />}><PreviewContent /></Screen>;
}

function PreviewContent() {
  const s = usePulseScale();
  return <View style={{ padding: 20 * s, gap: 12 * s }}>
    <PulseText font="regular" color={C.muted} style={{ marginBottom: 8 * s }}>Calendar, imports, live event RSVPs and event browsing use Supabase. Event creation, saved events and map details remain previews.</PulseText>
    {previews.map(([href, label]) => <PreviewLink key={href} href={href} label={label} style={{ backgroundColor: C.surface, padding: 16 * s, borderRadius: 14 * s, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><PulseText size={18}>{label}</PulseText><PulseIcon name="next" size={24} color={C.pink} /></PreviewLink>)}
  </View>;
}
