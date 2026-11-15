import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, View } from 'react-native';
import { PulseColors as C, PulseRadius, PulseSpacing } from '@/constants/pulse-theme';
import { summaries, type Engagement } from '@/lib/community';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { PreviewLink, PulseText, Screen, TitleHeader } from './ui';
import { Button, Loading, Message } from './schedule/controls';
import { EventCard } from './event-card';

export default function SavedEventsScreen() {
  const saved = useSavedEvents();
  const { refresh } = saved;
  const [error, setError] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, Engagement>>({});
  const [voteError, setVoteError] = useState('');
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  // Same vote and comment counts as the feed, for the events that still exist.
  const ids = (saved.data ?? []).filter(row => row.event).map(row => row.event_id).join(',');
  useEffect(() => {
    let active = true;
    if (ids) void summaries('event', ids.split(',')).then(rows => { if (active) { setScores(Object.fromEntries(rows.map(v => [v.id, v]))); setVoteError(''); } }).catch(e => { if (active) setVoteError(e.message); });
    return () => { active = false; };
  }, [ids]);
  async function remove(id: string) {
    setError(null);
    try { await saved.setSaved(id, false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove event.'); }
  }
  return <Screen scroll={false} header={<TitleHeader title="Saved Events" />} bottomBar activeTab="saved">
    <FlatList data={saved.data ?? []} keyExtractor={row => row.event_id} refreshing={saved.loading} onRefresh={refresh} contentContainerStyle={{ padding: 16, gap: 16 }}
      ListHeaderComponent={<><Message text={error || saved.error || voteError || null} error />{saved.error && <Button label="Try again" onPress={refresh} />}</>}
      ListEmptyComponent={saved.loading ? <Loading /> : !saved.error ? <View style={{ gap: 12 }}><PulseText>No saved events yet.</PulseText><PulseText>Save an event to find it here later.</PulseText><PreviewLink href="/" label="Browse events"><PulseText>Browse events</PulseText></PreviewLink></View> : undefined}
      renderItem={({ item }) => item.event
        ? <EventCard event={item.event} engagement={scores[item.event_id]} onEngagementChange={value => setScores(previous => ({ ...previous, [item.event_id]: value }))} />
        : <View style={{ padding: PulseSpacing.lg, gap: PulseSpacing.md, borderRadius: PulseRadius.lg, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border }}>
          <PulseText variant="label" tone="muted">This event is no longer available.</PulseText>
          <Button label="Remove unavailable event" disabled={saved.busy} onPress={() => void remove(item.event_id)} />
        </View>} />
  </Screen>;
}
