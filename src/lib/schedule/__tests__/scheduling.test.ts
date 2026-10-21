import { describe, expect, test } from '@jest/globals';
import { DateTime } from 'luxon';
import { compatibility, freeWindows, mergeIntervals, overlaps } from '../availability';
import { expandSchedule } from '../recurrence';
import { wallTime } from '../time';
import { validateSchedule } from '../validation';
import type { ScheduleSeries } from '../types';

export const series: ScheduleSeries = {
  id: 'class-1', user_id: 'student-1', import_id: null, version: 1, content_key: '',
  title: 'Computer science', kind: 'class', location: 'Library', timezone: 'America/New_York',
  start_local: '2026-10-26T09:00:00', end_local: '2026-10-26T10:00:00', term_end: '2026-11-09',
  recurrence: { days: [1, 3], interval: 1, count: null, until: null, weekStart: 1 }, all_day: false, busy: true, rdates: [], exdates: [], source_uid: null,
};
const range = { start: Date.parse('2026-10-01Z'), end: Date.parse('2026-12-01Z') };
describe('wall-clock recurrence', () => {
  test('keeps 9 AM across fall DST and includes the semester end', () => {
    const result = expandSchedule(series, [], range);
    expect(result).toHaveLength(5);
    expect(new Date(result[0].start).toISOString()).toBe('2026-10-26T13:00:00.000Z');
    expect(new Date(result[2].start).toISOString()).toBe('2026-11-02T14:00:00.000Z');
    expect(result.map(item => DateTime.fromMillis(item.start, { zone: series.timezone }).hour)).toEqual([9,9,9,9,9]);
    expect(result[4].recurrenceKey).toBe('2026-11-09T09:00:00');
  });
  test('honors alternating weeks and COUNT before EXDATE', () => {
    const result = expandSchedule({ ...series, term_end: '2026-12-01', recurrence: { ...series.recurrence!, interval: 2, count: 3 }, exdates: ['2026-10-26T09:00:00'] }, [], range);
    expect(result.map(item => item.recurrenceKey)).toEqual(['2026-10-28T09:00:00','2026-11-09T09:00:00']);
  });
  test('applies inclusive UTC UNTIL', () => {
    const result = expandSchedule({ ...series, recurrence: { ...series.recurrence!, until: '2026-11-02T14:00:00Z' } }, [], range);
    expect(result).toHaveLength(3);
  });
  test('moved-in occurrences retain original identity and cancellations remove only one', () => {
    const exceptions = [{ user_id: series.user_id, series_id: series.id, recurrence_key: '2026-10-26T09:00:00', cancelled: false, start_local: '2026-11-05T11:00:00', end_local: '2026-11-05T12:00:00' }, { user_id: series.user_id, series_id: series.id, recurrence_key: '2026-11-04T09:00:00', cancelled: true, start_local: null, end_local: null }];
    const result = expandSchedule(series, exceptions, { start: Date.parse('2026-11-04Z'), end: Date.parse('2026-11-06Z') });
    expect(result).toHaveLength(1); expect(result[0].id).toBe('class-1:2026-10-26T09:00:00');
  });
  test('rejects impossible manual dates, and picks the first repeated hour', () => {
    expect(wallTime('2026-03-08T02:30:00', series.timezone)).toBeNull();
    expect(wallTime('2026-11-01T01:30:00', series.timezone)?.toUTC().toISO()).toBe('2026-11-01T05:30:00.000Z');
    expect(validateSchedule({ ...series, start_local: '2026-02-30T09:00:00' }).length).toBeGreaterThan(0);
  });
  test('skips nonexistent weekly occurrence without consuming COUNT', () => {
    const result = expandSchedule({ ...series, start_local: '2026-03-01T02:30:00', end_local: '2026-03-01T03:30:00', term_end: '2026-03-22', recurrence: { days: [7], interval: 1, count: 2, until: null, weekStart: 1 } }, [], { start: Date.parse('2026-03-01Z'), end: Date.parse('2026-04-01Z') });
    expect(result.map(item => item.recurrenceKey)).toEqual(['2026-03-01T02:30:00','2026-03-15T02:30:00']);
  });
  test('supports overnight leap-day commitment', () => {
    const result = expandSchedule({ ...series, start_local: '2028-02-29T23:00:00', end_local: '2028-03-01T01:00:00', term_end: '2028-02-29', recurrence: null }, [], { start: Date.parse('2028-03-01T05:00Z'), end: Date.parse('2028-03-01T07:00Z') });
    expect(result).toHaveLength(1); expect(result[0].end - result[0].start).toBe(7200000);
  });
});
describe('availability', () => {
  test('adjacent events do not conflict', () => expect(overlaps({ start: 1, end: 2 }, { start: 2, end: 3 })).toBe(false));
  test('merges contained and overlapping busy intervals without mutating input', () => {
    const input = [{ start: 3, end: 8 }, { start: 1, end: 5 }, { start: 4, end: 6 }];
    expect(mergeIntervals(input)).toEqual([{ start: 1, end: 8 }]); expect(input[0]).toEqual({ start: 3, end: 8 });
  });
  test('clips busy intervals and respects minimum gap', () => {
    const minute = 60000;
    expect(freeWindows([{ start: -minute, end: 10 * minute }, { start: 40 * minute, end: 50 * minute }], { start: 0, end: 90 * minute }, 30)).toEqual([{ start: 10 * minute, end: 40 * minute }, { start: 50 * minute, end: 90 * minute }]);
  });
  test('incomplete data never claims compatibility', () => {
    expect(compatibility({ start: 1, end: 2 }, [], false)).toBe('unknown');
    expect(compatibility(null, [], true)).toBe('unknown');
  });
});
