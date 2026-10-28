import { useNotifications } from '@/providers/notifications-provider';
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router, type Href } from 'expo-router';
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseColors as C, PulseFonts } from '@/constants/pulse-theme';
import { useEvents } from '@/providers/events-provider';

const ScaleContext = createContext(1);
export const usePulseScale = () => useContext(ScaleContext);
const subscribeToHydration = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

const icons = {
  bell: require('@/assets/figma/bell.svg'),
  filter: require('@/assets/figma/filter.svg'),
  account: require('@/assets/figma/account.svg'),
  home: require('@/assets/figma/home.svg'),
  add: require('@/assets/figma/add.svg'),
  bookmark: require('@/assets/figma/bookmark-outline.svg'),
  bookmarkFilled: require('@/assets/figma/bookmark-filled.svg'),
  close: require('@/assets/figma/close.svg'),
  back: require('@/assets/figma/back.svg'),
  next: require('@/assets/figma/back.svg'),
  map: require('@/assets/figma/map-icon.svg'),
  pin: require('@/assets/figma/pin.svg'),
  pinPink: require('@/assets/figma/pin-pink.svg'),
  search: require('@/assets/figma/search.svg'),
  clear: require('@/assets/figma/clear.svg'),
  date: require('@/assets/figma/date.svg'),
} as const;

// The vector exports contain the glyph bounds, rather than the full icon slot.
const glyphBounds: Partial<Record<keyof typeof icons, readonly [number, number, number]>> = {
  filter: [22.5, 20.5, 24], account: [20, 20, 24], home: [40, 44, 48],
  back: [16, 28, 48], next: [16, 28, 48], map: [48, 44, 48],
  pin: [40, 48, 48], pinPink: [40, 48, 48],
};

export function PulseText({ children, size = 16, font = 'semibold', color = C.text, lineHeight, style }: {
  children: ReactNode;
  size?: number;
  font?: keyof typeof PulseFonts;
  color?: string;
  lineHeight?: number;
  style?: StyleProp<TextStyle>;
}) {
  const s = usePulseScale();
  return <Text style={[{ fontFamily: PulseFonts[font], color, fontSize: size * s, lineHeight: (lineHeight ?? size * 1.25) * s }, style]}>{children}</Text>;
}

export function PulseIcon({ name, size = 50, color = C.muted }: {
  name: keyof typeof icons;
  size?: number;
  color?: string;
}) {
  const s = usePulseScale();
  const [width, height, viewport] = glyphBounds[name] ?? [24, 24, 24];
  return <View style={{ width: size * s, height: size * s, alignItems: 'center', justifyContent: 'center' }}><Image source={icons[name]} contentFit="contain" tintColor={color} style={{ width: width / viewport * size * s, height: height / viewport * size * s, transform: name === 'next' ? [{ rotate: '180deg' }] : undefined }} /></View>;
}

export function PreviewLink({ href, label, children, style }: {
  href: Href;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <Link href={href} asChild><Pressable accessibilityRole="link" accessibilityLabel={label} style={StyleSheet.flatten(style)}>{children}</Pressable></Link>;
}

export function BackButton({ close = false }: { close?: boolean }) {
  const s = usePulseScale();
  return <Pressable accessibilityRole="button" accessibilityLabel={close ? 'Close screen' : 'Go back'} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ width: 50 * s, height: 50 * s, minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><PulseIcon name={close ? 'close' : 'back'} size={48} /></Pressable>;
}

export function TitleHeader({ title, close, right }: { title: string; close?: boolean; right?: ReactNode }) {
  const s = usePulseScale();
  return <View style={{ minHeight: 75 * s, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 * s, gap: (close ? 13 : 4) * s }}><BackButton close={close} /><PulseText size={24} color={C.white} style={{ flex: 1, transform: close ? [{ translateY: 3 * s }] : undefined }} lineHeight={32}>{title}</PulseText>{right}</View>;
}

export function SearchHeader({ query = 'search' }: { query?: string; home?: boolean }) {
  const s = usePulseScale();
  const { titleSearch, setTitleSearch } = useEvents();
  const { unread } = useNotifications();
  return <View style={{ height: 75 * s, backgroundColor: C.surface, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10 * s, gap: 6 * s }}>
    <PreviewLink href="/filters" label="Filter and sort"><PulseIcon name="filter" /></PreviewLink>
    <View style={{ flex: 1, height: 50 * s, borderRadius: 28 * s, backgroundColor: C.search, paddingLeft: 24 * s, paddingRight: 16 * s, flexDirection: 'row', alignItems: 'center', gap: 8 * s }}>
      <TextInput accessibilityLabel="Search events by title" value={titleSearch} placeholder={query} placeholderTextColor={C.muted} returnKeyType="search" autoCorrect={false} onChangeText={setTitleSearch} style={{ flex: 1, color: C.white, fontSize: 16 * s, letterSpacing: 0.5 * s, paddingVertical: 0 }} />
      <PulseIcon name="search" size={24} />
    </View>
    <PreviewLink href="/notifications" label={`Notifications, ${unread} unread`} style={{ minWidth: 48, minHeight: 48, justifyContent: 'center', alignItems: 'center' }}><PulseIcon name="bell" size={28} />{unread > 0 && <View style={{ position: 'absolute', right: 0, top: 0, backgroundColor: C.pink, borderRadius: 12, paddingHorizontal: 5, minWidth: 20, alignItems: 'center' }}><PulseText size={12} color={C.white}>{unread > 99 ? '99+' : unread}</PulseText></View>}</PreviewLink>
    <PreviewLink href="/profile" label="My profile" style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><PulseIcon name="account" /></PreviewLink>
  </View>;
}

export function BottomBar({ active }: { active?: 'home' | 'saved' | 'create' | 'calendar' }) {
  const s = usePulseScale();
  return <View style={{ minHeight: 75 * s, backgroundColor: C.surface, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' }}>
    <PreviewLink href="/create" label="Create event"><PulseIcon name="add" color={active === 'create' ? C.pink : C.muted} /></PreviewLink>
    <PreviewLink href="/" label="Home"><PulseIcon name="home" color={active === 'home' ? C.pink : C.muted} /></PreviewLink>
    <PreviewLink href="/saved" label="Saved events"><PulseIcon name="bookmarkFilled" color={active === 'saved' ? C.pink : C.muted} /></PreviewLink>
    <PreviewLink href="/calendar" label="Calendar" style={{ minWidth: 44, minHeight: 44, justifyContent: 'center' }}><PulseIcon name="date" color={active === 'calendar' ? C.pink : C.muted} /></PreviewLink>
  </View>;
}

export function StaticAction({ label }: { label: string }) {
  return <View accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: true }} aria-disabled><ActionFace label={label} /></View>;
}

function ActionFace({ label }: { label: string }) {
  const s = usePulseScale();
  return <View style={{ width: 300 * s, height: 75 * s, borderRadius: 25 * s, backgroundColor: C.pink, alignItems: 'center', justifyContent: 'center' }}><PulseText size={32} color={C.white}>{label}</PulseText></View>;
}

export function Screen({ children, header, activeTab, bottomBar = false, action, actionHref, onAction, overlay, scroll = true }: {
  children: ReactNode;
  header: ReactNode;
  activeTab?: 'home' | 'saved' | 'create' | 'calendar';
  bottomBar?: boolean;
  action?: string;
  actionHref?: Href;
  onAction?: () => void;
  overlay?: ReactNode;
  scroll?: boolean;
}) {
  const { width } = useWindowDimensions();
  // Keep exported HTML and the first hydrated render identical; then fit the phone.
  const hydrated = useSyncExternalStore(subscribeToHydration, clientSnapshot, serverSnapshot);
  const s = Math.min(hydrated && width > 0 ? width : 402, 402) / 402;
  return <ScaleContext.Provider value={s}><View style={styles.backdrop}><SafeAreaView edges={['top', 'bottom']} style={[styles.screen, { maxWidth: 402 }]}>
    {header}
    {scroll ? <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, minHeight: (874 - 75 - (bottomBar ? 75 : action ? 105 : 0)) * s }} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView> : <View style={{ flex: 1 }}>{children}</View>}
    {bottomBar && <BottomBar active={activeTab} />}
    {action && <View style={{ height: 105 * s, alignItems: 'center' }}>{onAction ? <Pressable accessibilityRole="button" onPress={onAction}><ActionFace label={action} /></Pressable> : actionHref ? <PreviewLink href={actionHref} label={action}><ActionFace label={action} /></PreviewLink> : <StaticAction label={action} />}</View>}
    {overlay}
  </SafeAreaView></View></ScaleContext.Provider>;
}

export function Photo({ source, width, height, children }: { source: ImageSource; width?: number; height: number; children?: ReactNode }) {
  const s = usePulseScale();
  return <View style={{ width: width === undefined ? '100%' : width * s, height: height * s, borderRadius: 25 * s, borderWidth: 3 * s, borderColor: C.border, overflow: 'hidden' }}>
    <Image source={source} contentFit="cover" style={StyleSheet.absoluteFill} />
    <LinearGradient colors={['rgba(102,102,102,0.75)', 'rgba(0,0,0,0.75)']} locations={[0, 0.75]} style={StyleSheet.absoluteFill} />
    {children}
  </View>;
}

export function Tag({ label, href }: { label: string; href?: Href }) {
  const s = usePulseScale();
  const tag = <View style={{ borderColor: C.pink, borderWidth: 3 * s, borderRadius: 7 * s, height: 32 * s, alignSelf: 'flex-start', paddingHorizontal: 12 * s, justifyContent: 'center' }}><Text style={{ color: C.pink, fontSize: 14 * s, fontWeight: '500' }}>{label}</Text></View>;
  return href ? <PreviewLink href={href} label="Browse categories">{tag}</PreviewLink> : tag;
}

export function EventRow({ title, subtitle = 'Location - time', image, saved = false, arrow = false }: {
  title: string;
  subtitle?: string;
  image: ImageSource;
  saved?: boolean;
  arrow?: boolean;
}) {
  const s = usePulseScale();
  return <View style={{ height: 115 * s, borderTopWidth: 1, borderBottomWidth: 1, borderColor: C.muted, flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7 * s }}>
    <PreviewLink href="/event" label={`Preview ${title} event`} style={{ flex: 1, flexDirection: 'row', gap: 14 * s }}>
      <Photo source={image} width={100} height={100} />
      <View style={{ flex: 1 }}><PulseText font="black" color={C.pink} size={24} lineHeight={32}>{title}</PulseText><PulseText font="black" size={16} lineHeight={32}>{subtitle}</PulseText></View>
    </PreviewLink>
    <View style={{ position: 'absolute', right: 0, top: 27 * s }}>
      {arrow ? <PreviewLink href="/event" label={`Open ${title} details`}><PulseIcon name="next" size={48} /></PreviewLink> : <View accessibilityLabel={saved ? 'Saved event' : 'Unsaved event'}><PulseIcon name="bookmarkFilled" color={saved ? C.pink : C.muted} /></View>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.background, alignItems: 'center' },
  screen: { flex: 1, width: '100%', backgroundColor: C.background },
});
