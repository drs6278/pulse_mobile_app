import { useState } from 'react';
import { Platform, View } from 'react-native';
import { PulseColors as C, PulseSpacing } from '@/constants/pulse-theme';
import { useCalendarEntries } from '@/hooks/use-calendar-entries';
import { eventDetailsColumns, eventInterval, type PulseEvent } from '@/lib/event-query';
import { compatibility } from '@/lib/schedule/availability';
import { setRSVP } from '@/lib/rsvp-repository';
import { supabase } from '@/lib/supabase';
import { useRSVPs } from '@/providers/rsvp-provider';
import { useSavedEvents } from '@/providers/saved-events-provider';
import { useSaveEvent } from '../save-event-button';
import { ActionSheet, type SheetAction } from '../ui/action-sheet';
import { Button, IconButton } from '../ui/button';
import { InlineMessage } from '../ui/feedback';

// How the event fits the viewer's schedule; null when the event has no usable time.
export function useScheduleFit(event: PulseEvent) {
  const interval = eventInterval(event);
  const [fallbackRange] = useState(() => ({ start: Date.now(), end: Date.now() + 86400000 }));
  const calendar = useCalendarEntries(interval ?? fallbackRange);
  const busyIntervals = [...calendar.occurrences.filter(item => item.busy), ...calendar.events.filter(item => String(item.event.id) !== String(event.id))];
  return interval ? compatibility(interval, busyIntervals, calendar.complete) : null;
}

const exportHelp = Platform.OS === 'web'
  ? 'Export downloads an ICS file. Calendar imports are managed by your calendar app.'
  : 'Export needs device calendar access to choose a calendar and update earlier exports. Pulse does not upload your device calendar. Requires a development build.';

// Pinned to the bottom of the event page: RSVP, save, and add to calendar in one row.
export function EventActionBar({ event }: { event: PulseEvent }) {
  const rsvps = useRSVPs();
  const savedEvents = useSavedEvents();
  const save = useSaveEvent(event.id);
  const interval = eventInterval(event);
  const status = rsvps.data?.find(item => String(item.event_id) === String(event.id))?.status;
  const going = status === 'going';
  const [busy, setBusy] = useState(false), [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  const [choices, setChoices] = useState<{ id: string; title: string }[]>([]);
  async function rsvp() {
    setBusy(true); setError(null); setMessage(null);
    try { await rsvps.mutate(userId => setRSVP(supabase, userId, String(event.id), going ? 'cancelled' : 'going')); setMessage(going ? 'RSVP canceled. Any device calendar export remains until you remove it.' : 'You’re going. This event will appear on your Pulse calendar.'); }
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
  const calendarActions: SheetAction[] = choices.flatMap(choice => [
    { label: Platform.OS === 'web' ? choice.title : `Add to ${choice.title}`, disabled: busy, onPress: () => void exportTo(choice.id) },
    ...(Platform.OS === 'web' ? [] : [{ label: `Remove Pulse export from ${choice.title}`, danger: true, disabled: busy, onPress: () => void exportTo(choice.id, true) }]),
  ]);
  const canceled = !!event.pulse_cancelled && !going;
  return <View style={{ gap: PulseSpacing.sm }}>
    <InlineMessage text={message} />
    <InlineMessage text={error || rsvps.error || save.error || savedEvents.error} error />
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: PulseSpacing.sm }}>
      <View style={{ flex: 1 }}>
        <Button
          label={canceled ? 'Event canceled' : going ? 'Going' : 'I’m going'}
          accessibilityLabel={going ? 'Cancel RSVP' : undefined}
          icon={going ? 'check' : undefined}
          variant={going ? 'secondary' : 'primary'}
          disabled={busy || rsvps.loading || !!rsvps.error || canceled}
          onPress={() => void rsvp()} />
      </View>
      <IconButton
        bordered
        icon={save.selected ? 'bookmarkFilled' : 'bookmark'}
        color={save.selected ? C.accent : C.text}
        label={`${save.selected ? 'Unsave' : 'Save'} ${event.title}`}
        selected={save.selected}
        disabled={save.disabled}
        onPress={() => void save.toggle()} />
      <IconButton
        bordered
        icon="calendarAdd"
        color={C.text}
        label={Platform.OS === 'web' ? 'Export ICS' : 'Add to device calendar'}
        disabled={busy || !interval}
        onPress={() => void choose()} />
    </View>
    <ActionSheet visible={choices.length > 0} title={exportHelp} actions={calendarActions} onClose={() => setChoices([])} />
  </View>;
}
