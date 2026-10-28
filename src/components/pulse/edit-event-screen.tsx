import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert, Platform, View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { canEditEvent, eventDraft, updateEvent } from '@/lib/event-edit';
import { eventDetailsColumns, type PulseEvent } from '@/lib/event-query';
import { profileSessionClient } from '@/lib/profile/repository';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useEvents } from '@/providers/events-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import { Screen, TitleHeader, PulseText } from './ui';
import { EventFormFields } from './screens';
import { Button, Message } from './schedule/controls';

export default function EditEventScreen() {
  const { id } = useLocalSearchParams<{ id?: string | string[] }>();
  const eventId = Array.isArray(id) ? id[0] : id;
  const loader = useCallback(async (_user: string, signal: AbortSignal) => {
    const { data, error } = await supabase.from('events').select(eventDetailsColumns).eq('id', eventId ?? '').abortSignal(signal).maybeSingle<PulseEvent>();
    if (error) throw error;
    return data;
  }, [eventId]);
  const resource = useUserResource(loader);
  // Foreground refreshes must not replace or unmount a draft being edited.
  // The server revision check handles changes made after this snapshot opened.
  const [opened, setOpened] = useState<{ user: string; event: PulseEvent } | null>(null);
  const loaded = resource.data, user = resource.userId;
  const currentEvent = opened?.user === user && opened?.event.id === eventId
    ? opened.event : loaded?.id === eventId ? loaded : null;
  if (loaded && user && loaded.id === eventId && (opened?.user !== user || opened.event.id !== eventId)) {
    setOpened({ user, event: loaded });
  }
  return <Screen header={<TitleHeader title="Edit event" />}><View style={{ padding: 16, gap: 16 }}>
    {currentEvent ? <EditSession key={`${user}:${currentEvent.id}`} event={currentEvent} user={user ?? undefined} /> : resource.loading ? <PulseText>Loading event…</PulseText> : resource.error ? <><Message text={resource.error} error /><Button label="Try again" onPress={resource.refresh} /></> : <PulseText>This event is unavailable for editing. Only the original poster can edit it before it starts.</PulseText>}
  </View></Screen>;
}
function EditSession({ event, user }: { event: PulseEvent; user?: string }) {
  const [eligible] = useState(() => canEditEvent(event, user));
  return eligible ? <Editor event={event} /> : <PulseText>This event is unavailable for editing. Only the original poster can edit it before it starts.</PulseText>;
}
function Editor({ event }: { event: PulseEvent }) {
  const { session } = useAuth();
  const [initial] = useState(() => eventDraft(event));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const navigation = useNavigation();
  const events = useEvents(), rsvps = useRSVPs();
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  usePreventRemove(!saved && (dirty || busy), ({ data }) => {
    if (busy) return;
    if (Platform.OS === 'web') {
      if (window.confirm('Discard your unsaved event changes?')) navigation.dispatch(data.action);
    } else Alert.alert('Discard changes?', 'Your unsaved event changes will be lost.', [
      { text: 'Keep editing', style: 'cancel' },
      { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(data.action) },
    ]);
  });
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useEffect(() => {
    if (Platform.OS !== 'web' || !dirty || saved) return;
    const prevent = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', prevent);
    return () => window.removeEventListener('beforeunload', prevent);
  }, [dirty, saved]);
  useEffect(() => { if (saved) router.replace({ pathname: '/event', params: { id: event.id } }); }, [saved, event.id]);
  const allowed = canEditEvent(event, session?.user.id, now);
  async function save() {
    if (busy || !allowed) return;
    setBusy(true); setError(null);
    try {
      await updateEvent(profileSessionClient(session?.access_token), event, draft);
      events.refresh(); rsvps.refresh(); setSaved(true);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to save event.'); setBusy(false); }
  }
  return <>
    {!allowed && <Message text="Only the original poster can edit an event, and only before it starts." error />}
    <EventFormFields draft={draft} busy={busy || !allowed} change={values => { setDraft(previous => ({ ...previous, ...values })); setError(null); }} />
    <PulseText size={14}>Saving updates the event immediately and notifies Going attendees. Existing RSVPs are kept.</PulseText>
    <Message text={error} error />
    <Button label={busy ? 'Saving…' : 'Save changes'} disabled={busy || !allowed || !dirty} onPress={() => void save()} />
  </>;
}
