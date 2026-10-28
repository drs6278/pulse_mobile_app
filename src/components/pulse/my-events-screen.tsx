import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { fetchHostedEvents } from '@/lib/profile/repository';
import { canEditEvent } from '@/lib/event-edit';
import { EVENTS_PER_PAGE } from '@/lib/event-query';
import { supabase } from '@/lib/supabase';
import { Screen, TitleHeader, PulseText, PreviewLink } from './ui';
import { Button, Message } from './schedule/controls';

export default function MyEventsScreen() {
  const [page, setPage] = useState(0);
  const loader = useCallback((user: string, signal: AbortSignal) => fetchHostedEvents(supabase, user, page, signal), [page]);
  const resource = useUserResource(loader);
  const { refresh } = resource;
  useFocusEffect(useCallback(() => { refresh(); }, [refresh]));
  return <Screen header={<TitleHeader title="My posted events" />}><View style={{ padding: 16, gap: 16 }}>
    {resource.loading ? <PulseText>Loading events…</PulseText> : resource.error ? <><Message text={resource.error} error /><Button label="Try again" onPress={resource.refresh} /></> : <>
      {!resource.data?.events.length && <PulseText>No upcoming posted events.</PulseText>}
      {resource.data?.events.map(event => <View key={event.id} style={{ gap: 12, paddingVertical: 12 }}>
        <PreviewLink href={{ pathname: '/event', params: { id: event.id } }} label={`Open ${event.title}`}><PulseText size={22}>{event.title}</PulseText><PulseText>{event.event_date} · {event.location}</PulseText></PreviewLink>
        {canEditEvent(event, resource.userId ?? undefined) && <PreviewLink href={{ pathname: '/edit-event', params: { id: event.id } }} label={`Edit ${event.title}`} style={{ minHeight: 48, justifyContent: 'center' }}><PulseText>Edit event</PulseText></PreviewLink>}
      </View>)}
      {page > 0 && <Button label="Previous" onPress={() => setPage(page - 1)} />}
      {(page + 1) * EVENTS_PER_PAGE < (resource.data?.count ?? 0) && <Button label="Next" onPress={() => setPage(page + 1)} />}
    </>}
  </View></Screen>;
}
