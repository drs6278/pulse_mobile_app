import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { Link, router, type Href } from 'expo-router';
import type { ReactNode } from 'react';
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { PulseColors as C, PulseGradients, PulseLayout, PulseRadius, PulseSpacing, PulseType } from '@/constants/pulse-theme';
import { useEvents } from '@/providers/events-provider';
import { useNotifications } from '@/providers/notifications-provider';
import { Button, IconButton } from './button';
import { PulseIcon } from './icon';
import { PulseText } from './text';

type Tab = 'home' | 'saved' | 'create' | 'calendar';

export function PreviewLink({ href, label, children, style }: {
  href: Href;
  label: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <Link href={href} asChild><Pressable accessibilityRole="link" accessibilityLabel={label} style={StyleSheet.flatten(style)}>{children}</Pressable></Link>;
}

export function BackButton({ close = false }: { close?: boolean }) {
  return <IconButton icon={close ? 'close' : 'back'} label={close ? 'Close screen' : 'Go back'} color={C.text} onPress={() => router.canGoBack() ? router.back() : router.replace('/')} />;
}

export function HeaderActions() {
  const { unread } = useNotifications();
  return <View style={styles.row}>
    <IconButton icon="bell" href="/notifications" label={`Notifications, ${unread} unread`} badge={unread} />
    <IconButton icon="account" href="/profile" label="My profile" />
  </View>;
}

export function ScreenHeader({ title, close, back = true, right }: { title: string; close?: boolean; back?: boolean; right?: ReactNode }) {
  return <View style={[styles.header, !back && styles.rootHeader]}>
    {back && <BackButton close={close} />}
    <PulseText variant={back ? 'heading' : 'title'} accessibilityRole="header" numberOfLines={1} style={styles.headerTitle}>{title}</PulseText>
    {right}
  </View>;
}

export const TitleHeader = ScreenHeader;

export function SearchHeader({ query = 'Search events' }: { query?: string; home?: boolean }) {
  const { titleSearch, setTitleSearch } = useEvents();
  return <View style={[styles.header, styles.rootHeader]}>
    <View style={styles.search}>
      <PulseIcon name="search" size={20} />
      <TextInput accessibilityLabel="Search events by title" value={titleSearch} placeholder={query} placeholderTextColor={C.textMuted} returnKeyType="search" autoCorrect={false} onChangeText={setTitleSearch} style={styles.searchInput} />
    </View>
    <IconButton icon="filter" href="/filters" label="Filter and sort" />
    <HeaderActions />
  </View>;
}

export function BottomBar({ active }: { active?: Tab }) {
  const tint = (tab: Tab) => active === tab ? C.accent : C.textMuted;
  return <View style={styles.bottomBar}>
    <IconButton icon="home" href="/" label="Home" color={tint('home')} />
    <IconButton icon="add" href="/create" label="Create event" color={tint('create')} />
    <IconButton icon="bookmarkFilled" href="/saved" label="Saved events" color={tint('saved')} />
    <IconButton icon="date" href="/calendar" label="Calendar" color={tint('calendar')} />
  </View>;
}

export function Screen({ children, header, activeTab, bottomBar = false, action, actionHref, onAction, overlay, scroll = true, onRefresh, refreshing = false }: {
  children: ReactNode;
  header: ReactNode;
  activeTab?: Tab;
  bottomBar?: boolean;
  action?: string;
  actionHref?: Href;
  onAction?: () => void;
  overlay?: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return <View style={styles.backdrop}><SafeAreaView edges={['top', 'bottom']} style={styles.screen}>
    {header}
    {scroll ? <ScrollView refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.accent} /> : undefined} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" style={styles.fill} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView> : <View style={styles.fill}>{children}</View>}
    {bottomBar && <BottomBar active={activeTab} />}
    {action && <View style={styles.footer}><Button label={action} variant="primary" onPress={onAction} href={onAction ? undefined : actionHref} disabled={!onAction && !actionHref} /></View>}
    {overlay}
  </SafeAreaView></View>;
}

export function Photo({ source, width, height, children }: { source: ImageSource; width?: number; height: number; children?: ReactNode }) {
  return <View style={[styles.photo, { width: width ?? '100%', height }]}>
    <Image source={source} contentFit="cover" style={StyleSheet.absoluteFill} />
    <LinearGradient colors={PulseGradients.photo} style={StyleSheet.absoluteFill} />
    {children}
  </View>;
}

export function Tag({ label, href }: { label: string; href?: Href }) {
  const tag = <View style={styles.tag}><PulseText variant="caption" tone="accent">{label}</PulseText></View>;
  return href ? <PreviewLink href={href} label="Browse categories">{tag}</PreviewLink> : tag;
}

export function EventRow({ title, subtitle = 'Location - time', image, saved = false, arrow = false }: {
  title: string;
  subtitle?: string;
  image: ImageSource;
  saved?: boolean;
  arrow?: boolean;
}) {
  return <View style={styles.eventRow}>
    <PreviewLink href="/event" label={`Preview ${title} event`} style={styles.eventLink}>
      <Photo source={image} width={72} height={72} />
      <View style={styles.fill}><PulseText variant="heading">{title}</PulseText><PulseText variant="label" tone="muted">{subtitle}</PulseText></View>
    </PreviewLink>
    {arrow
      ? <IconButton icon="next" href="/event" label={`Open ${title} details`} />
      : <View accessibilityLabel={saved ? 'Saved event' : 'Unsaved event'}><PulseIcon name="bookmarkFilled" color={saved ? C.accent : C.textMuted} /></View>}
  </View>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: C.background, alignItems: 'center' },
  screen: { flex: 1, width: '100%', maxWidth: PulseLayout.maxContentWidth, backgroundColor: C.background },
  fill: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'center' },
  header: { minHeight: 56, paddingHorizontal: PulseSpacing.xs, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.xs },
  rootHeader: { paddingLeft: PulseLayout.gutter },
  headerTitle: { flex: 1 },
  search: { flex: 1, height: 40, paddingHorizontal: PulseSpacing.md, borderRadius: PulseRadius.pill, backgroundColor: C.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.sm },
  searchInput: { flex: 1, color: C.text, fontFamily: PulseType.body.fontFamily, fontSize: PulseType.label.fontSize, paddingVertical: 0 },
  bottomBar: { minHeight: 56, backgroundColor: C.surface, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border, flexDirection: 'row', justifyContent: 'space-evenly', alignItems: 'center' },
  footer: { paddingHorizontal: PulseLayout.gutter, paddingVertical: PulseSpacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  photo: { borderRadius: PulseRadius.md, overflow: 'hidden', backgroundColor: C.surfaceRaised },
  tag: { alignSelf: 'flex-start', paddingHorizontal: PulseSpacing.sm, paddingVertical: PulseSpacing.xs, borderRadius: PulseRadius.sm, backgroundColor: C.scrim },
  eventRow: { minHeight: 88, paddingVertical: PulseSpacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: C.border, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.md },
  eventLink: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.md },
});
