import { useState } from 'react';
import { Platform, View } from 'react-native';
import { useCalendarEntries } from '@/hooks/use-calendar-entries';
import { eventDetailsColumns, eventInterval, type PulseEvent } from '@/lib/event-query';
import { compatibility } from '@/lib/schedule/availability';
import { setRSVP } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';
import { useRSVPs } from '@/providers/rsvp-provider';
import { Button, Message } from './controls';

export function EventActions({ event }: { event: PulseEvent }) {
  const rsvps = useRSVPs();
  const interval = eventInterval(event);
  const [fallbackRange] = useState(() => ({ start: Date.now(), end: Date.now() + 86400000 }));
  const calendar = useCalendarEntries(interval ?? fallbackRange);
  const status = rsvps.data?.find(item => String(item.event_id) === String(event.id))?.status;
  const busyIntervals = [...calendar.occurrences.filter(item => item.busy), ...calendar.events.filter(item => String(item.event.id) !== String(event.id))];
  const fit = compatibility(interval, busyIntervals, calendar.complete);
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<{ id: string; title: string }[]>([]);
  async function rsvp() {
    setBusy(true); setError(null); setMessage(null);
    try { await rsvps.mutate(userId => setRSVP(supabase, userId, String(event.id), status === 'going' ? 'cancelled' : 'going')); setMessage(status === 'going' ? 'RSVP canceled. Any device calendar export remains until you remove it.' : 'You’re going. This event will appear on your Pulse calendar.'); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to update RSVP.'); }
    finally { setBusy(false); }
  }
  async function choose() {
    setBusy(true); setError(null); setMessage(null);
    try { const adapter = await import('@/lib/calendar/export'); setChoices(await adapter.calendarChoices()); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Calendar unavailable. Use a development build on native devices.'); }
    finally { setBusy(false); }
  }
  async function exportTo(id: string, remove = false) {
    if (!rsvps.userId) return;
    setBusy(true); setError(null);
    try {
      const { data: latest, error: queryError } = await supabase.from('events').select(eventDetailsColumns).eq('id', event.id).maybeSingle<PulseEvent>();
      if (queryError) throw queryError;
      if (!latest && !remove) throw new Error('This event is no longer available.');
      const adapter = await import('@/lib/calendar/export'); setMessage(await adapter.exportEvent(latest ?? event, rsvps.userId, id, remove)); setChoices([]);
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Unable to export.'); }
    finally { setBusy(false); }
  }
  return <View style={{ gap: 12 }}>
    <Message text={event.pulse_cancelled ? 'This event has been canceled.' : interval ? `Schedule compatibility: ${fit}${fit === 'conflicting' ? '. You can still choose to attend.' : ''}` : 'Time unavailable. Schedule compatibility cannot be confirmed.'} />
    <Message text={rsvps.error} error />
    <Button label={status === 'going' ? 'Cancel RSVP' : 'RSVP — I’m going'} disabled={busy || rsvps.loading || !!rsvps.error || (!!event.pulse_cancelled && status !== 'going')} onPress={() => void rsvp()} />
    <Message text={Platform.OS === 'web' ? 'Export downloads an ICS file. Calendar imports are managed by your calendar app.' : 'Export needs device calendar access to choose a calendar and update earlier exports. Pulse does not upload your device calendar. Requires a development build.'} />
    <Button label={Platform.OS === 'web' ? 'Export ICS' : 'Add or update device calendar'} disabled={busy || !interval} onPress={() => void choose()} />
    {choices.map(choice => <View key={choice.id} style={{ gap: 8 }}><Button label={choice.title} disabled={busy} onPress={() => void exportTo(choice.id)} />{Platform.OS !== 'web' && <Button label={`Remove Pulse export from ${choice.title}`} disabled={busy} danger onPress={() => void exportTo(choice.id, true)} />}</View>)}
    {!!choices.length && <Button label="Close calendar choices" disabled={busy} onPress={() => setChoices([])} />}
    <Message text={message} /><Message text={error} error />
  </View>;
}
