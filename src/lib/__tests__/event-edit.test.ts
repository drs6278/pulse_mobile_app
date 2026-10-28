import { test, expect } from '@jest/globals';
import { canEditEvent, eventDraft } from '../event-edit';
import { notificationChanges } from '../notifications';

const event = { id: '1', title: 'Game', location: 'Gym', category: 'Sports', event_date: '2030-01-01', created_by: 'alice', pulse_starts_at: '2030-01-01T14:00:00Z', pulse_ends_at: '2030-01-01T15:00:00Z', pulse_timezone: 'America/New_York', pulse_age_min: 18 };
test('only the owner can edit strictly before the start', () => {
  const start = Date.parse(event.pulse_starts_at);
  expect(canEditEvent(event, 'alice', start - 1)).toBe(true);
  expect(canEditEvent(event, 'alice', start)).toBe(false);
  expect(canEditEvent(event, 'bob', start - 1)).toBe(false);
  expect(canEditEvent({ ...event, pulse_cancelled: true }, 'alice', start - 1)).toBe(false);
  expect(canEditEvent({ ...event, pulse_starts_at: null }, 'alice', start - 1)).toBe(false);
});
test('editor uses the original timezone and all form values', () => {
  expect(eventDraft(event)).toEqual({ title: 'Game', location: 'Gym', category: 'Sports', timezone: 'America/New_York', start_local: '2030-01-01T09:00:00', end_local: '2030-01-01T10:00:00', age_min: 18 });
});
test('notification summaries show readable old and new field values', () => {
  expect(notificationChanges({ id: 'n', event_id: '1', event_title: 'Game', created_at: '', read_at: null, changes: { title: { before: 'Game', after: 'New game' }, pulse_age_min: { before: 0, after: 21 } } })).toEqual(['Title: Game → New game', 'Age restriction: All ages → 21+']);
});
