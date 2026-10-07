import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PulseColors as C, PulseImages as Images } from '@/constants/pulse-theme';
import {
  EventRow, Photo, PreviewLink, PulseIcon, PulseText, Screen,
  SearchHeader, Tag, TitleHeader, usePulseScale,
} from './ui';

export function HomeScreen() {
  return <Screen header={<SearchHeader home />} bottomBar activeTab="home"><HomeContent /></Screen>;
}

function HomeContent() {
  const s = usePulseScale();
  return <View style={{ paddingHorizontal: 12 * s, paddingTop: 18 * s, gap: 18 * s }}>
    {[
      { title: 'Concert', tag: 'Music', time: '9:00pm est', image: Images.concert, saved: false },
      { title: 'Food Truck', tag: 'Food', time: '4:00pm est', image: Images.foodTruck, saved: true },
    ].map(event => <View key={event.title}>
      <Photo source={event.image} height={200}>
        <View style={{ position: 'absolute', top: 12 * s, left: 12 * s }}><Tag label={event.tag} href="/categories" /></View>
        <PreviewLink href="/event" label={`Preview ${event.title}`} style={{ position: 'absolute', left: 13 * s, right: 65 * s, bottom: 6 * s }}>
          <PulseText font="black" size={24} lineHeight={32}>{event.title}</PulseText>
          <PulseText font="regular" size={16} lineHeight={23}>{event.time}</PulseText>
        </PreviewLink>
        <View accessibilityLabel={event.saved ? 'Saved event' : 'Unsaved event'} style={{ position: 'absolute', right: 7 * s, bottom: 7 * s }}><PulseIcon name={event.saved ? 'bookmarkFilled' : 'bookmark'} size={40} color={event.saved ? C.pink : C.muted} /></View>
      </Photo>
    </View>)}
  </View>;
}

export function CategoriesScreen() {
  return <Screen header={<TitleHeader title="Browse Categories" close />}><CategoriesContent /></Screen>;
}

function CategoriesContent() {
  const s = usePulseScale();
  return <View style={{ paddingLeft: 18 * s, paddingRight: 14 * s, paddingTop: 12 * s, flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 * s, rowGap: 25 * s }}>
    {['Music', 'Food', 'Sports', 'Art', 'Outdoors', 'Other'].map(category => <PreviewLink key={category} href="/search" label={`Preview ${category} category`}>
      <Photo source={Images.categories} width={175} height={175}><View style={{ position: 'absolute', left: 7 * s, bottom: 7 * s }}><PulseText font="black" size={24} lineHeight={32}>{category}</PulseText></View></Photo>
    </PreviewLink>)}
  </View>;
}

export function FiltersScreen() {
  return <Screen header={<TitleHeader title="Filter & sort" close right={<PulseText size={24} color={C.pink}>Reset</PulseText>} />} action="Show Results" actionHref="/search"><FiltersContent /></Screen>;
}

function FilterGroup({ title, options }: { title: string; options: string[] }) {
  const s = usePulseScale();
  return <View>
    <PulseText size={32} color={C.white} lineHeight={40}>{title}</PulseText>
    <View style={{ marginTop: 12 * s, flexDirection: 'row', flexWrap: 'wrap', columnGap: 18 * s, rowGap: 18 * s }}>
      {options.map((label, index) => <View key={label} accessibilityLabel={`${label}${index === 0 ? ', selected' : ''}`} style={{ width: 80 * s, height: 45 * s, borderRadius: 25 * s, borderWidth: index === 0 ? 0 : 3 * s, borderColor: C.muted, backgroundColor: index === 0 ? C.pink : 'transparent', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><Text numberOfLines={1} ellipsizeMode="clip" style={{ fontSize: 14 * s, fontWeight: '500', color: index === 0 ? C.white : C.muted }}>{label}</Text></View>)}
    </View>
  </View>;
}

function FiltersContent() {
  const s = usePulseScale();
  return <View style={{ paddingHorizontal: 11 * s, paddingTop: 17 * s }}>
    <FilterGroup title="Category" options={['All', 'Food', 'Music', 'Sports', 'Arts']} />
    <View style={{ marginTop: 41 * s }}><FilterGroup title="Date" options={['Today', 'Tomorrow', 'This Week', 'This Weekend', 'Pick Date']} /></View>
    <View style={{ marginTop: 41 * s }}><FilterGroup title="Distance" options={['1 mi', '5 mi', '10 mi', 'Pick Dist.']} /></View>
  </View>;
}

export function SearchScreen() {
  return <Screen header={<SearchHeader query="food trucks" />} bottomBar activeTab="home"><SearchContent /></Screen>;
}

function SearchContent() {
  const s = usePulseScale();
  return <View style={{ paddingHorizontal: 14 * s, paddingTop: 35 * s }}>
    <PulseText size={16} font="black" lineHeight={25}>Results for “food trucks”</PulseText>
    <PulseText size={12} font="black" lineHeight={24}>2 events found</PulseText>
    <View style={{ marginTop: 17 * s }}>
      <EventRow title="Food" image={Images.search} arrow />
      <EventRow title="Food" image={Images.search} arrow />
    </View>
  </View>;
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

export function ImportScreen() {
  return <Screen header={<TitleHeader title="Import Schedule" />} action="Import"><ImportContent /></Screen>;
}

function ImportContent() {
  const s = usePulseScale();
  return <View style={{ paddingTop: 44 * s }}>
    <View style={{ marginHorizontal: 22 * s, height: 212 * s, backgroundColor: '#FEF7FF', borderColor: C.muted, borderWidth: 5 * s, borderRadius: 25 * s, overflow: 'hidden', flexDirection: 'row', justifyContent: 'center', gap: 16 * s }}>
      {[0, 1, 2, 3].map(column => <View key={column} style={{ width: 70 * s, backgroundColor: 'rgba(1,135,134,0.12)' }} />)}
    </View>
    <View style={{ marginTop: 19 * s, marginLeft: 94 * s, flexDirection: 'row', gap: 15 * s, alignItems: 'center' }}><PulseIcon name="account" /><View accessibilityRole="button" accessibilityState={{ disabled: true }} aria-disabled style={{ width: 150 * s, height: 50 * s, borderRadius: 25 * s, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}><PulseText size={32} color={C.white}>Connect</PulseText></View></View>
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

export function CalendarScreen() {
  return <Screen header={<SearchHeader />} bottomBar><CalendarContent /></Screen>;
}

function CalendarGrid() {
  const s = usePulseScale();
  const days = [null, ...Array.from({ length: 30 }, (_, i) => i + 1), 1, 2, 3, 4];
  return <View accessibilityLabel="September 2025 calendar, September 9 through 13 selected" style={{ width: 318 * s, height: 308 * s, backgroundColor: C.muted, borderRadius: 16 * s, borderWidth: 1, borderColor: '#D9D9D9', paddingHorizontal: 13 * s }}>
    <View style={{ height: 66 * s, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7 * s }}>
      <PulseIcon name="back" size={20} color={C.white} />
      <View style={{ flexDirection: 'row', gap: 7 * s }}>
        {['Sep', '2025'].map(label => <View key={label} style={{ width: 88 * s, height: 29 * s, borderRadius: 8 * s, borderWidth: 1, borderColor: '#D9D9D9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 7 * s }}><Text style={{ color: C.white, fontSize: 16 * s }}>{label}</Text><View style={{ transform: [{ rotate: '90deg' }] }}><PulseIcon name="next" size={16} color={C.white} /></View></View>)}
      </View>
      <PulseIcon name="next" size={20} color={C.white} />
    </View>
    <View style={{ flexDirection: 'row', height: 21 * s }}>{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(day => <Text key={day} style={{ flex: 1, textAlign: 'center', fontSize: 12 * s, color: C.white }}>{day}</Text>)}</View>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>{days.map((day, i) => <View key={i} style={{ width: '14.285714%', height: 41 * s, alignItems: 'center', justifyContent: 'center' }}><View style={{ width: 40 * s, height: 40 * s, borderRadius: 8 * s, backgroundColor: i === 9 || i === 13 ? C.pink : 'transparent', alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: i > 30 ? '#B3B3B3' : C.white, fontSize: 16 * s }}>{day}</Text></View></View>)}</View>
  </View>;
}

function CalendarContent() {
  const s = usePulseScale();
  return <View style={{ paddingTop: 27 * s }}>
    <PulseText size={32} font="black" color={C.white} lineHeight={40} style={{ marginLeft: 45 * s }}>Calendar</PulseText>
    <View style={{ marginTop: 33 * s, alignItems: 'center' }}><CalendarGrid /></View>
    <PulseText size={32} font="black" color={C.white} lineHeight={40} style={{ marginTop: 33 * s, marginLeft: 45 * s }}>Upcoming</PulseText>
    <View style={{ marginTop: 19 * s, marginHorizontal: 14 * s }}><EventRow title="Concert" subtitle="Jiffy Lube - 7:30 PM" image={Images.calendar} /></View>
  </View>;
}

const previews = [
  ['/', 'Home Dashboard'], ['/categories', 'Browse Categories'], ['/filters', 'Filter & Sort'],
  ['/search', 'Search Results'], ['/saved', 'Saved Events'], ['/event', 'Event Details'],
  ['/create', 'Create Event'], ['/import-schedule', 'Import Schedule'], ['/map', 'Map'], ['/calendar', 'Calendar'],
] as const;

export function ScreensIndex() {
  return <Screen header={<TitleHeader title="Screen previews" />}><PreviewContent /></Screen>;
}

function PreviewContent() {
  const s = usePulseScale();
  return <View style={{ padding: 20 * s, gap: 12 * s }}>
    <PulseText font="regular" color={C.muted} style={{ marginBottom: 8 * s }}>Pulse designs with navigation only. Event actions and fields are static.</PulseText>
    {previews.map(([href, label]) => <PreviewLink key={href} href={href} label={label} style={{ backgroundColor: C.surface, padding: 16 * s, borderRadius: 14 * s, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><PulseText size={18}>{label}</PulseText><PulseIcon name="next" size={24} color={C.pink} /></PreviewLink>)}
  </View>;
}
