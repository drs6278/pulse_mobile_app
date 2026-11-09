import { useCallback, useEffect, useState } from 'react';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { usePreventRemove } from 'expo-router/react-navigation';
import { Alert, Platform, View } from 'react-native';
import { useUserResource } from '@/hooks/use-user-resource';
import { canEditEvent, eventDraft, updateEvent } from '@/lib/event-edit';
import { useEventPermission } from '@/hooks/use-event-permission';
import { fetchEventById, type PulseEvent } from '@/lib/event-query';
import { pickEventPhoto, removeEventPhoto, uploadEventPhoto, type PickedEventPhoto } from '@/lib/event-photo';
import { EventPhotoField } from './event-photo-field';
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
  const loader = useCallback((_user: string, signal: AbortSignal) => fetchEventById(supabase, eventId ?? '', signal), [eventId]);
  const resource = useUserResource(loader);
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
  const eligible = useEventPermission(event, user);
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
  const clubAllowed = useEventPermission(event, session?.user.id);
  const allowed = event.club_id ? clubAllowed && !!event.pulse_starts_at && Date.parse(event.pulse_starts_at) > now : canEditEvent(event, session?.user.id, now);
  // Photo changes apply immediately and don't touch the revision, so they never block Save.
  const [photoPath, setPhotoPath] = useState(event.pulse_image_path ?? null);
  const [pendingPhoto, setPendingPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false), [photoError, setPhotoError] = useState<string | null>(null);
  async function changePhoto(next: 'pick' | 'remove') {
    setPhotoError(null);
    let picked: PickedEventPhoto | null = null;
    if (next === 'pick') {
      try { picked = await pickEventPhoto(); } catch (reason) { setPhotoError(reason instanceof Error ? reason.message : 'Unable to open your photos.'); return; }
      if (!picked) return;
      setPendingPhoto(picked.uri);
    }
    setPhotoBusy(true);
    try {
      const client = profileSessionClient(session?.access_token);
      if (picked) setPhotoPath(await uploadEventPhoto(client, event.id, picked));
      else { await removeEventPhoto(client, event.id); setPhotoPath(null); }
      events.refresh();
    } catch (reason) { setPhotoError(reason instanceof Error ? reason.message : 'Unable to update the photo.'); }
    finally { setPendingPhoto(null); setPhotoBusy(false); }
  }
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
    {allowed && <EventPhotoField uri={pendingPhoto ?? undefined} path={photoPath} busy={photoBusy} error={photoError} onChoose={() => void changePhoto('pick')} onRemove={() => void changePhoto('remove')} />}
    <EventFormFields draft={draft} busy={busy || !allowed} change={values => { setDraft(previous => ({ ...previous, ...values })); setError(null); }} />
    <PulseText size={14}>Saving updates the event immediately and notifies Going attendees. Existing RSVPs are kept.</PulseText>
    <Message text={error} error />
    <Button label={busy ? 'Saving…' : 'Save changes'} disabled={busy || !allowed || !dirty} onPress={() => void save()} />
  </>;
}
