import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Calendar from 'expo-calendar';
import { eventInterval, type PulseEvent } from '../event-query';
import { supabase } from '../supabase';

export type CalendarChoice = { id: string; title: string };
const pending = new Set<string>();
export async function calendarChoices(): Promise<CalendarChoice[]> {
  const permission = await Calendar.requestCalendarPermissions(false);
  if (permission.status !== 'granted') throw new Error('Calendar access was not granted. Your Pulse RSVP has not changed.');
  const calendars = await Calendar.getCalendars(Calendar.EntityTypes.EVENT);
  const choices = calendars.filter(calendar => calendar.allowsModifications).map(calendar => ({ id: calendar.id, title: calendar.title }));
  if (!choices.length) throw new Error('No writable calendar found. Add a calendar account on your device first.');
  return choices;
}
export async function exportEvent(event: PulseEvent, userId: string, calendarId: string, remove = false) {
  const key = `pulse:calendar-export:${userId}:${event.id}:${calendarId}`;
  if (pending.has(key)) throw new Error('This export is already in progress.');
  pending.add(key);
  try {
    const permission = await Calendar.getCalendarPermissions(false);
    if (permission.status !== 'granted') throw new Error('Calendar permission was revoked.');
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id !== userId) throw new Error('Account changed. Reopen event details.');
    const calendar = await Calendar.ExpoCalendar.get(calendarId);
    if (!calendar.allowsModifications) throw new Error('The selected calendar is read-only.');
    const interval = eventInterval(event);
    if (!interval) throw new Error('A verified start and end time is required.');
    const marker = `Pulse event: ${event.id}`;
    const stored = await AsyncStorage.getItem(key);
    let existing: Calendar.ExpoCalendarEvent | null = null;
    if (stored) {
      try { existing = await Calendar.ExpoCalendarEvent.get(stored); }
      catch {
        // Keep the marker fallback bounded; never recreate on an ambiguous API failure.
        const matches = await calendar.listEvents(new Date(interval.start - 366 * 86400000), new Date(interval.end + 366 * 86400000));
        existing = matches.find(item => item.notes?.split('\n').includes(marker)) ?? null;
      }
    } else {
      const matches = await calendar.listEvents(new Date(interval.start - 366 * 86400000), new Date(interval.end + 366 * 86400000));
      existing = matches.find(item => item.notes?.split('\n').includes(marker)) ?? null;
    }
    if (existing && (existing.calendarId !== calendarId || !existing.notes?.split('\n').includes(marker))) throw new Error('The previous export no longer matches this Pulse event. Review it in your calendar before retrying.');
    const { data: latest } = await supabase.auth.getSession();
    if (latest.session?.user.id !== userId) throw new Error('Account changed. Reopen event details.');
    if (remove) {
      if (existing) await existing.delete();
      await AsyncStorage.removeItem(key);
      return existing ? 'Exported event removed.' : 'No Pulse export found in that calendar.';
    }
    if (event.pulse_cancelled) throw new Error('This event was canceled. Remove its previous export instead.');
    const details = { title: event.title, location: event.location, startDate: new Date(interval.start), endDate: new Date(interval.end), allDay: !!event.pulse_all_day_start, timeZone: event.pulse_timezone ?? 'UTC', notes: marker };
    if (existing) await existing.update(details);
    else existing = await calendar.createEvent(details);
    await AsyncStorage.setItem(key, existing.id);
    return 'Calendar export saved. Future Pulse changes require an explicit update.';
  } finally { pending.delete(key); }
}
