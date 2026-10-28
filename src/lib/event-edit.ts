import { DateTime } from 'luxon';
import type { SupabaseClient } from '@supabase/supabase-js';
import { eventRow, validateEventDraft, type EventDraft } from './event-create';
import { eventInterval, type PulseEvent } from './event-query';
import { eventCategories } from './event-filters';

export function canEditEvent(event: PulseEvent, user?: string, now = Date.now()) {
  const interval = eventInterval(event);
  return !!user && event.created_by === user && !event.pulse_cancelled && !!interval && interval.start > now;
}
export function eventDraft(event: PulseEvent): EventDraft {
  const timezone = event.pulse_timezone ?? 'UTC';
  const interval = eventInterval(event);
  if (!interval) throw new Error('This event has no verified start and end time.');
  return { title: event.title, location: event.location,
    category: eventCategories.find(category => category === event.category) ?? 'Other', timezone,
    start_local: DateTime.fromMillis(interval.start, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    end_local: DateTime.fromMillis(interval.end, { zone: timezone }).toFormat("yyyy-MM-dd'T'HH:mm:ss"),
    age_min: event.pulse_age_min === 18 ? 18 : event.pulse_age_min === 21 ? 21 : 0 };
}
export async function updateEvent(client: SupabaseClient, event: PulseEvent, draft: EventDraft) {
  const errors = validateEventDraft(draft);
  if (errors.length) throw new Error(errors.join('\n'));
  const { error } = await client.rpc('edit_pulse_event', { p_id: event.id, p_revision: event.pulse_revision, p_draft: eventRow(draft) });
  if (error) throw new Error(['42883', 'PGRST202'].includes(error.code) ? 'Event editing needs the server update. Please try again after it is applied.' : error.message);
}
