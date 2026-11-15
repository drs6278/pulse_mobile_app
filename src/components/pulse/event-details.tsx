import { router, useFocusEffect, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { PulseColors as C, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { useEventPermission } from '@/hooks/use-event-permission';
import { communityRpc, summaries, type Engagement } from '@/lib/community';
import { fetchEventById, type PulseEvent } from '@/lib/event-query';
import { eventWhen } from '@/lib/event-time';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { EventDiscussion, useVote } from './community';
import { CommentCountPill } from './event-card';
import { EventActionBar, useScheduleFit } from './schedule/event-actions';
import { EventPhoto } from './ui/event-photo';
import { ActionSheet, Button, IconButton, InlineMessage, PreviewLink, PulseIcon, PulseText, Screen, TitleHeader, VoteControl, type PulseIconName, type PulseTextTone } from './ui';

export function SupabaseEventScreen({ id, photoError }: { id: string; photoError?: string }) {
  const { session } = useAuth();
  const [result, setResult] = useState<{ key: string; event: PulseEvent | null; error: string | null } | null>(null);
  const [revision, setRevision] = useState(0);
  const [commentVersion, setCommentVersion] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  useFocusEffect(useCallback(() => { setRevision(value => value + 1); }, []));
  const reload = () => setRevision(value => value + 1);
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
  const header = <TitleHeader title="Event details" right={<>
    <IconButton icon="refresh" label="Refresh event" onPress={reload} />
    {allowed && event && <IconButton icon="more" label="Event options" onPress={() => setMenuOpen(true)} />}
  </>} />;
  return <Screen onRefresh={reload} refreshing={loading} header={header} footer={event && !error ? <EventActionBar key={event.id} event={event} /> : undefined}>
    <View style={{ padding: PulseSpacing.lg, gap: PulseSpacing.lg }}>
      <InlineMessage text={photoError ? `Your event was posted, but the photo didn’t upload: ${photoError} You can add it from Edit event.` : null} error />
      {loading ? <ActivityIndicator accessibilityLabel="Loading event" color={C.accent} />
        : error ? <View accessibilityRole="alert" style={{ gap: PulseSpacing.md }}><PulseText>{error}</PulseText><Button label="Try again" onPress={reload} /></View>
        : event && <>
          {event.pulse_image_path && <EventPhoto path={event.pulse_image_path} style={{ height: 220, borderRadius: PulseRadius.lg }} />}
          <View style={{ gap: PulseSpacing.xs }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.sm }}>
              <PulseText variant="label" tone="accent">{event.category}</PulseText>
              {event.pulse_cancelled && <View style={{ paddingHorizontal: PulseSpacing.sm, paddingVertical: 2, borderRadius: PulseRadius.sm, borderWidth: 1, borderColor: C.danger }}><PulseText variant="caption" tone="danger">Canceled</PulseText></View>}
            </View>
            <PulseText variant="display" accessibilityRole="header">{event.title}</PulseText>
          </View>
          <EventEngagement eventId={event.id} version={`${revision}:${commentVersion}`} />
          <EventInfoCard event={event} />
          <EventDiscussion key={`discussion:${session?.user.id}:${event.id}:${revision}`} eventId={event.id} onCommentsChanged={() => setCommentVersion(value => value + 1)} />
          {menuOpen && <ActionSheet visible title="Event options" onClose={() => setMenuOpen(false)} actions={[
            { label: 'Edit event', onPress: () => router.push({ pathname: '/edit-event', params: { id: event.id } }) },
            ...(event.club_id ? [{ label: 'Cancel club event', danger: true, onPress: () => { void communityRpc('cancel_club_event', { p_event: event.id }).then(reload).catch(() => setResult({ key, event, error: 'Unable to cancel club event. Refresh and try again.' })); } }] : []),
          ]} />}
        </>}
    </View>
  </Screen>;
}

// The event's own votes and comment count, refetched when the page or its discussion changes.
function EventEngagement({ eventId, version }: { eventId: string; version: string }) {
  const [engagement, setEngagement] = useState<Engagement | undefined>();
  const [loadError, setLoadError] = useState('');
  const votes = useVote('event', engagement, setEngagement);
  useEffect(() => {
    let active = true;
    void summaries('event', [eventId]).then(rows => { if (active) { setEngagement(rows[0]); setLoadError(''); } }).catch(e => { if (active) setLoadError(e.message); });
    return () => { active = false; };
  }, [eventId, version]);
  return <View style={{ gap: PulseSpacing.xs }}>
    {engagement && <View style={{ flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.sm }}>
      <VoteControl score={Number(engagement.score)} myVote={engagement.my_vote} disabled={votes.busy} onVote={direction => void votes.cast(direction)} />
      <CommentCountPill count={engagement.comment_count} />
    </View>}
    <InlineMessage text={votes.error || loadError} error />
  </View>;
}

const fitDetail = {
  compatible: { text: 'Fits your schedule', tone: 'accent' },
  conflicting: { text: 'Conflicts with your schedule · you can still go', tone: 'danger' },
  unknown: { text: 'Couldn’t check your schedule', tone: 'muted' },
} as const satisfies Record<string, { text: string; tone: PulseTextTone }>;

function EventInfoCard({ event }: { event: PulseEvent }) {
  const when = eventWhen(event);
  const fit = useScheduleFit(event);
  const fitLine = fit && !event.pulse_cancelled ? fitDetail[fit] : null;
  return <View style={{ padding: PulseSpacing.md, gap: PulseSpacing.xs, borderRadius: PulseRadius.lg, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface }}>
    <InfoRow icon="date" title={when.date} detail={when.time} extra={fitLine} />
    <InfoRow icon="pin" title={event.location} />
    {event.club_id && <InfoRow icon="people" title="Hosting club" href={{ pathname: '/clubs', params: { id: event.club_id } }} />}
    {event.created_by && <InfoRow icon="account" title="Organizer profile" href={{ pathname: '/student-profile', params: { id: event.created_by } }} />}
    {!!event.pulse_age_min && <InfoRow icon="info" title={`${event.pulse_age_min}+`} detail="Self-reported age eligibility required" />}
  </View>;
}

function InfoRow({ icon, title, detail, extra, href }: {
  icon: PulseIconName;
  title: string;
  detail?: string | null;
  extra?: { text: string; tone: PulseTextTone } | null;
  href?: Href;
}) {
  const content = <>
    <View style={{ width: 36, height: 36, borderRadius: PulseRadius.md, backgroundColor: C.surfaceRaised, alignItems: 'center', justifyContent: 'center' }}>
      <PulseIcon name={icon} size={18} color={C.accent} />
    </View>
    <View style={{ flex: 1 }}>
      <PulseText variant="body">{title}</PulseText>
      {!!detail && <PulseText variant="label" tone="muted">{detail}</PulseText>}
      {extra && <PulseText variant="label" tone={extra.tone}>{extra.text}</PulseText>}
    </View>
    {href && <PulseIcon name="next" size={18} />}
  </>;
  const style = { minHeight: 48, paddingVertical: PulseSpacing.xs, flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.md } as const;
  if (href) return <PreviewLink href={href} label={title} style={style}>{content}</PreviewLink>;
  return <View style={style}>{content}</View>;
}
