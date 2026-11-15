import { Link, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { PulseColors as C, PulseLayout, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import type { Engagement } from '@/lib/community';
import type { PulseEvent } from '@/lib/event-query';
import { useVote } from './community';
import { useSaveEvent } from './save-event-button';
import { EventPhoto } from './ui/event-photo';
import { InlineMessage } from './ui/feedback';
import { PulseIcon } from './ui/icon';
import { PreviewLink } from './ui/layout';
import { PulseText } from './ui/text';
import { VoteControl } from './ui/vote-control';

// A link on the feed card; plain text on the event page, where the discussion is already below.
export function CommentCountPill({ count, href }: { count: number; href?: Href }) {
  const label = `${count} comments and replies`;
  const content = <>
    <PulseIcon name="comment" size={18} />
    <PulseText variant="label" tone="muted">{count}</PulseText>
  </>;
  if (!href) return <View accessible accessibilityLabel={label} style={styles.pill}>{content}</View>;
  return <Link href={href} asChild>
    <Pressable accessibilityRole="link" accessibilityLabel={label} hitSlop={4} style={styles.pill}>{content}</Pressable>
  </Link>;
}

export function eventDateLabel(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// The card is two siblings: the link (photo + text) and an action footer, so no buttons sit inside the link.
// With a photo, the photo fills the link area and the text sits on a scrim at the bottom.
export function EventCard({ event, engagement, onEngagementChange }: {
  event: PulseEvent;
  engagement?: Engagement;
  onEngagementChange: (value: Engagement) => void;
}) {
  const photo = event.pulse_image_path;
  const href = { pathname: '/event', params: { id: event.id } } as const;
  const save = useSaveEvent(event.id);
  const votes = useVote('event', engagement, onEngagementChange);
  const error = votes.error || save.error;
  return <View style={styles.card}>
    <PreviewLink href={href} label={`Open ${event.title}`} style={photo ? styles.photoLink : undefined}>
      {photo && <EventPhoto path={photo} scrim style={StyleSheet.absoluteFill} />}
      <View style={styles.body}>
        <PulseText variant="label" tone="accent">{event.category}</PulseText>
        <PulseText variant="title" numberOfLines={2}>{event.title}</PulseText>
        <PulseText variant="label" tone={photo ? 'default' : 'muted'} numberOfLines={1}>{eventDateLabel(event.event_date)} · {event.location}</PulseText>
      </View>
    </PreviewLink>
    <View style={styles.footer}>
      <View style={styles.actions}>
        {engagement && <>
          <VoteControl score={Number(engagement.score)} myVote={engagement.my_vote} disabled={votes.busy} onVote={direction => void votes.cast(direction)} />
          <CommentCountPill count={engagement.comment_count} href={href} />
        </>}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${save.selected ? 'Unsave' : 'Save'} ${event.title}`}
          accessibilityState={{ selected: save.selected, disabled: save.disabled }}
          disabled={save.disabled}
          onPress={() => void save.toggle()}
          hitSlop={4}
          style={({ pressed }) => [styles.save, (save.disabled || pressed) && styles.dimmed]}>
          <PulseIcon name={save.selected ? 'bookmarkFilled' : 'bookmark'} color={save.selected ? C.accent : C.textMuted} />
        </Pressable>
      </View>
      <InlineMessage text={error} error />
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { borderRadius: PulseRadius.lg, overflow: 'hidden', backgroundColor: C.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  photoLink: { minHeight: 220, justifyContent: 'flex-end' },
  body: { padding: PulseSpacing.lg, gap: PulseSpacing.xs },
  footer: { paddingHorizontal: PulseSpacing.md, paddingVertical: PulseSpacing.sm, gap: PulseSpacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderColor: C.border },
  actions: { flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.sm },
  pill: { height: PulseLayout.compactControlHeight, paddingHorizontal: PulseSpacing.md, borderRadius: PulseRadius.pill, backgroundColor: C.surfaceRaised, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.xs },
  save: { width: PulseLayout.compactControlHeight, height: PulseLayout.compactControlHeight, marginLeft: 'auto', alignItems: 'center', justifyContent: 'center' },
  dimmed: { opacity: 0.55 },
});
