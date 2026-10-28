import { expect, test } from '@jest/globals';
import { DateTime } from 'luxon';
import { inclusiveEnd, moveScheduleStart, newScheduleDraft, setInclusiveEnd } from '../editor';
import { validateSchedule } from '../validation';

const now = DateTime.fromISO('2026-10-23T14:20:00Z');
test('new entries use the selected date, schedule timezone and one-hour duration', () => {
  const draft = newScheduleDraft('America/New_York', '2026-10-26', now);
  expect(draft).toMatchObject({ start_local: '2026-10-26T09:00:00', end_local: '2026-10-26T10:00:00', kind: 'commitment', recurrence: null, timezone: 'America/New_York' });
  expect(newScheduleDraft('America/New_York', 'invalid', now).start_local).toBe('2026-10-23T11:00:00');
  expect(newScheduleDraft('UTC', '2026-02-30', now).start_local).toBe('2026-10-23T15:00:00');
});

test('moving start preserves wall-clock duration across DST without changing recurrence metadata', () => {
  const draft = newScheduleDraft('America/New_York', '2026-10-26', now);
  expect(moveScheduleStart(draft, '2026-11-02T14:30:00')).toEqual({ start_local: '2026-11-02T14:30:00', end_local: '2026-11-02T15:30:00' });
  expect(moveScheduleStart({ ...draft, start_local: 'bad' }, '2026-11-02T14:30:00')).toEqual({ start_local: '2026-11-02T14:30:00' });
});

test('all-day display includes the last day while storage ends at the next midnight', () => {
  const draft = { ...newScheduleDraft('UTC', '2026-10-26', now), all_day: true, start_local: '2026-10-26T00:00:00', end_local: '2026-10-27T00:00:00' };
  expect(inclusiveEnd(draft)).toBe('2026-10-26T00:00:00');
  expect(setInclusiveEnd('2026-10-29T00:00:00', true)).toBe('2026-10-30T00:00:00');
  expect(setInclusiveEnd('2026-10-29T11:00:00', false)).toBe('2026-10-29T11:00:00');
});

test('recurrence cannot save without a weekday matching its first date', () => {
  const draft = { ...newScheduleDraft('UTC', '2026-10-26', now), title: 'Class', recurrence: { days: [2], interval: 1, weekStart: 1, count: null, until: null } };
  expect(validateSchedule(draft)).toContain('The first class date must match a selected weekday.');
  expect(validateSchedule({ ...draft, recurrence: { ...draft.recurrence, days: [] } })).toContain('Select at least one valid weekday.');
});
