import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { FlatList, View } from 'react-native';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { PreviewLink, PulseText, Screen, TitleHeader } from './ui';
import { Button, Loading, Message } from './schedule/controls';
import { SaveEventButton } from './save-event-button';

export default function SavedEventsScreen() {
  const saved = useSavedEvents();
  const { refresh } = saved;
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  async function remove(id: string) {
    setError(null);
    try { await saved.setSaved(id, false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to remove event.'); }
  }
  return <Screen scroll={false} header={<TitleHeader title="Saved Events" />} bottomBar activeTab="saved">
    <FlatList data={saved.data ?? []} keyExtractor={row => row.event_id} refreshing={saved.loading} onRefresh={refresh} contentContainerStyle={{ padding: 16, gap: 16 }}
      ListHeaderComponent={<><Message text={error || saved.error} error />{saved.error && <Button label="Try again" onPress={refresh} />}</>}
      ListEmptyComponent={saved.loading ? <Loading /> : !saved.error ? <View style={{ gap: 12 }}><PulseText>No saved events yet.</PulseText><PulseText>Save an event to find it here later.</PulseText><PreviewLink href="/" label="Browse events"><PulseText>Browse events</PulseText></PreviewLink></View> : null}
      renderItem={({ item }) => <View style={{ padding: 16, borderWidth: 1, borderColor: '#777', borderRadius: 16, gap: 8 }}>
        {item.event ? <><PreviewLink href={{ pathname: '/event', params: { id: item.event_id } }} label={`Open ${item.event.title}`}><PulseText size={22}>{item.event.title}</PulseText><PulseText>{item.event.category} · {item.event.event_date}</PulseText><PulseText>{item.event.location}</PulseText></PreviewLink><SaveEventButton id={item.event_id} title={item.event.title} /></>
          : <><PulseText>This event is no longer available.</PulseText><Button label="Remove unavailable event" disabled={saved.busy} onPress={() => void remove(item.event_id)} /></>}
      </View>} />
  </Screen>;
}
