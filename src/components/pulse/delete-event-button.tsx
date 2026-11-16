import { useRef, useState } from 'react';
import { router } from 'expo-router';
import type { PulseEvent } from '@/lib/event-query';
import { profileSessionClient } from '@/lib/profile/repository';
import { useAuth } from '@/providers/auth-provider';
import { useEvents } from '@/providers/events-provider';
import { useRSVPs } from '@/providers/rsvp-provider';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { Button, Message } from './schedule/controls';

export function DeleteEventButton({ event }: { event: PulseEvent }) {
  const { session } = useAuth();
  const events = useEvents(), rsvps = useRSVPs(), saved = useSavedEvents();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lock = useRef(false);
  async function remove() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      const { error } = await profileSessionClient(session?.access_token).rpc('delete_pulse_event', { p_id: event.id, p_revision: event.pulse_revision });
      if (error) throw new Error(['42883', 'PGRST202'].includes(error.code) ? 'Event deletion needs the server update. Please try again after it is applied.' : error.message);
      events.refresh(); rsvps.refresh(); saved.refresh();
      router.replace('/search');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to delete this event. Please try again.');
      lock.current = false; setBusy(false);
    }
  }
  return <>
    <Message text={error} error />
    {confirming ? <>
      <Message text={`Permanently delete “${event.title}”? Its RSVPs, saved entries, and discussion will be removed. This cannot be undone.`} />
      <Button label={busy ? 'Deleting…' : 'Confirm event deletion'} danger disabled={busy} onPress={() => void remove()} />
      <Button label="Keep event" disabled={busy} onPress={() => { setConfirming(false); setError(null); }} />
    </> : <Button label="Delete event" danger onPress={() => setConfirming(true)} />}
  </>;
}
