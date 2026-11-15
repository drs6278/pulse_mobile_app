import { expect, test } from '@jest/globals';
import { eventWhen } from '../event-time';
import type { PulseEvent } from '../event-query';

const base: PulseEvent = { id: '1', title: 'Concert', category: 'Music', event_date: '2026-11-03', location: 'Hall' };
// Intl may use a narrow no-break space before AM/PM; compare on plain spaces.
const plain = (value: { date: string; time: string | null }) => ({ date: value.date.replace(/\s/g, ' '), time: value.time?.replace(/\s/g, ' ') ?? null });

test('same-day timed events show one date and a time range in the event zone', () => {
  const when = eventWhen({ ...base, pulse_starts_at: '2026-11-04T00:00:00Z', pulse_ends_at: '2026-11-04T02:00:00Z', pulse_timezone: 'America/New_York' }, 'en-US');
  expect(plain(when)).toEqual({ date: 'Tue, Nov 3, 2026', time: '7:00 PM – 9:00 PM EST' });
});

test('timed events that cross midnight show both days', () => {
  const when = eventWhen({ ...base, pulse_starts_at: '2026-11-04T03:00:00Z', pulse_ends_at: '2026-11-04T06:00:00Z', pulse_timezone: 'America/New_York' }, 'en-US');
  expect(plain(when).time).toBe('Nov 3, 10:00 PM – Nov 4, 1:00 AM EST');
});

test('a one-day all-day event treats the stored end as exclusive', () => {
  const when = eventWhen({ ...base, pulse_all_day_start: '2026-11-03', pulse_all_day_end: '2026-11-04' }, 'en-US');
  expect(plain(when)).toEqual({ date: 'Tue, Nov 3, 2026', time: 'All day' });
});

test('multi-day all-day events show the inclusive range', () => {
  const when = eventWhen({ ...base, pulse_all_day_start: '2026-11-03', pulse_all_day_end: '2026-11-06' }, 'en-US');
  expect(plain(when)).toEqual({ date: 'Nov 3 – Nov 5, 2026', time: 'All day' });
});

test('events without scheduling details fall back to the listed date', () => {
  expect(plain(eventWhen(base, 'en-US'))).toEqual({ date: 'Nov 3, 2026', time: null });
});
