import type { SupabaseClient } from '@supabase/supabase-js';
import { DateTime } from 'luxon';

import { eventCategories } from './event-filters';
import { defaultPreferences, toLocal, validZone, wallTime } from './schedule/time';

export type EventDraft = {
  title: string;
  location: string;
  category: typeof eventCategories[number];
  timezone: string;
  start_local: string;
  end_local: string;
  age_min?: 0 | 18 | 21;
};

export function defaultEventDraft(timezone = defaultPreferences().timezone): EventDraft {
  const start = DateTime.now().setZone(timezone).startOf('hour').plus({ hours: 1 });
  return { title: '', location: '', category: 'Other', timezone, start_local: toLocal(start), end_local: toLocal(start.plus({ hours: 1 })) };
}

export function moveEventStart(draft: EventDraft, start_local: string): Partial<EventDraft> {
  const previous = wallTime(draft.start_local, draft.timezone), end = wallTime(draft.end_local, draft.timezone);
  const start = wallTime(start_local, draft.timezone);
  if (!start) return { start_local };
  const duration = previous && end && end > previous ? end.diff(previous).toMillis() : 60 * 60 * 1000;
  return { start_local, end_local: toLocal(start.plus({ milliseconds: duration })) };
}

export function validateEventDraft(draft: EventDraft, now = Date.now()): string[] {
  const errors: string[] = [];
  if (!draft.title.trim() || draft.title.trim().length > 200) errors.push('Title must contain 1–200 characters.');
  // Mirrors the hosted events_location_check constraint.
  if (!draft.location.trim() || draft.location.trim().length > 300) errors.push('Location must contain 1–300 characters.');
  if (!eventCategories.includes(draft.category)) errors.push('Choose a category.');
  if (![0, 18, 21].includes(draft.age_min ?? 0)) errors.push('Choose a valid age restriction.');
  if (!validZone(draft.timezone)) errors.push('Choose a valid IANA timezone, such as America/New_York.');
  const start = wallTime(draft.start_local, draft.timezone), end = wallTime(draft.end_local, draft.timezone);
  if (!start || !end) errors.push('Enter valid local dates and times. Times skipped by daylight saving are invalid.');
  if (start && end && (end <= start || end.diff(start, 'days').days > 7)) errors.push('End must follow start and be within seven days.');
  if (start && start.toMillis() < now) errors.push('Start must be in the future.');
  return errors;
}

// Times are stored as UTC instants plus the zone they were entered in, matching the scheduling contract.
export function eventRow(draft: EventDraft) {
  const start = wallTime(draft.start_local, draft.timezone), end = wallTime(draft.end_local, draft.timezone);
  if (!start || !end) throw new Error('Enter valid local dates and times.');
  return {
    title: draft.title.trim(),
    location: draft.location.trim(),
    category: draft.category,
    event_date: draft.start_local.slice(0, 10),
    pulse_starts_at: start.toUTC().toISO()!,
    pulse_ends_at: end.toUTC().toISO()!,
    pulse_timezone: draft.timezone,
    pulse_age_min: draft.age_min ?? 0,
  };
}

export function eventCreateError(error: unknown) {
  const value = error as { code?: string; message?: string };
  if (['42501', '42703', 'PGRST204'].includes(value?.code ?? '')) return 'Event posting isn’t set up on this server yet. Apply the event-creation migration, then retry.';
  return value?.message || 'Unable to connect. Your event was not posted; retry safely.';
}

// The owner and ID are assigned by the database (see the event-creation migration).
export async function createEvent(client: SupabaseClient, draft: EventDraft) {
  const errors = validateEventDraft(draft);
  if (errors.length) throw new Error(errors.join('\n'));
  const { data, error } = await client.from('events').insert(eventRow(draft)).select('id::text').single<{ id: string }>();
  if (error) throw new Error(eventCreateError(error));
  return data.id;
}
