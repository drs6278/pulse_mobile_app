import { describe, expect, test } from '@jest/globals';
import ICAL from 'ical.js';
import { parseCSV, CSV_HEADER } from '../import/csv';
import { parseICS } from '../import/ics';
import { compareImport } from '../import/deduplication';
import { serializeEvent } from '../../calendar/ics';

const calendar = (entries: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Test//EN\r\n${entries}\r\nEND:VCALENDAR`;
const entry = (extra = '') => `BEGIN:VEVENT\r\nUID:cs101@test\r\nSUMMARY:CS 101\r\nDTSTART;TZID=America/New_York:20261026T090000\r\nDTEND;TZID=America/New_York:20261026T100000\r\n${extra}\r\nEND:VEVENT`;
describe('imports', () => {
  test('CSV handles BOM, quoted commas and semester-to-weekday alignment', () => {
    const result = parseCSV(`\uFEFF${CSV_HEADER}\n"CS, systems",class,Library,MO|WE,09:00,10:00,2026-10-25,2026-12-01,America/New_York`, 'UTC', '2026-12-01');
    expect(result.candidates[0].issues).toEqual([]);
    expect(result.candidates[0].draft.title).toBe('CS, systems');
    expect(result.candidates[0].draft.start_local).toBe('2026-10-26T09:00:00');
  });
  test('CSV reports invalid times, unknown days, and unknown headers', () => {
    expect(parseCSV(`${CSV_HEADER}\nCS,class,,M,25:00,10:00,2026-10-26,2026-12-01,UTC`, 'UTC', '2026-12-01').candidates[0].issues.length).toBeGreaterThan(1);
    expect(() => parseCSV('title,unknown\nCS,x', 'UTC', '2026-12-01')).toThrow();
  });
  test('ICS supports folded summary, exclusions and moved/canceled exceptions', () => {
    const detached = 'BEGIN:VEVENT\r\nUID:cs101@test\r\nRECURRENCE-ID;TZID=America/New_York:20261028T090000\r\nDTSTART;TZID=America/New_York:20261029T110000\r\nDTEND;TZID=America/New_York:20261029T120000\r\nEND:VEVENT';
    const result = parseICS(calendar(entry('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4\r\nEXDATE;TZID=America/New_York:20261102T090000') + '\r\n' + detached), 'America/New_York', '2026-12-01');
    expect(result.errors).toEqual([]); expect(result.candidates[0].issues).toEqual([]);
    expect(result.candidates[0].draft.exdates).toEqual(['2026-11-02T09:00:00']);
    expect(result.candidates[0].exceptions[0].recurrence_key).toBe('2026-10-28T09:00:00');
  });
  test('ICS rejects unsupported recurrence without silently dropping it', () => {
    const result = parseICS(calendar(entry('RRULE:FREQ=MONTHLY;BYDAY=1MO')), 'UTC', '2026-12-01');
    expect(result.candidates).toHaveLength(0); expect(result.errors[0]).toContain('weekly');
  });
  test('duplicate entries in one file are skipped', () => {
    const result = parseICS(calendar(entry() + '\r\n' + entry()), 'UTC', '2026-12-01');
    expect(compareImport(result.candidates, []).map(item => item.action)).toEqual(['add', 'skip']);
  });
  test('floating times require timezone confirmation and UTC stays UTC', () => {
    const floating = entry().replaceAll(';TZID=America/New_York', '');
    expect(parseICS(calendar(floating), 'America/New_York', '2026-12-01').warnings).toHaveLength(1);
    const utc = floating.replace('20261026T090000','20261026T090000Z').replace('20261026T100000','20261026T100000Z');
    expect(parseICS(calendar(utc), 'America/New_York', '2026-12-01').candidates[0].draft.timezone).toBe('UTC');
  });
  test('all-day end is exclusive', () => {
    const text = 'BEGIN:VEVENT\r\nUID:holiday\r\nSUMMARY:Holiday\r\nDTSTART;VALUE=DATE:20261026\r\nEND:VEVENT';
    const result = parseICS(calendar(text), 'UTC', '2026-12-01');
    expect(result.candidates[0].draft.end_local).toBe('2026-10-27T00:00:00');
  });
  test('folded ICS text is unfolded without dropping meaningful spaces', () => {
    const result = parseICS(calendar(entry().replace('SUMMARY:CS 101', 'SUMMARY:Computer\r\n  Science')), 'UTC', '2026-12-01');
    expect(result.candidates[0].draft.title).toBe('Computer Science');
  });
  test('each EXDATE property validates its own timezone', () => {
    const result = parseICS(calendar(entry('RRULE:FREQ=WEEKLY;BYDAY=MO\r\nEXDATE;TZID=America/New_York:20261102T090000\r\nEXDATE:20261109T090000Z')), 'UTC', '2026-12-01');
    expect(result.candidates).toHaveLength(0); expect(result.errors[0]).toContain('timezone');
  });
  test('maximum accepted CSV size is complete and over-limit records fail explicitly', () => {
    const rows = Array.from({ length: 2000 }, (_, index) => `Class ${index},class,,MO,09:00,10:00,2026-10-26,2026-12-01,UTC`);
    const parsed = parseCSV(`${CSV_HEADER}\n${rows.join('\n')}`, 'UTC', '2026-12-01');
    expect(parsed.candidates).toHaveLength(2000); expect(parsed.candidates.every(item => !item.issues.length)).toBe(true);
    expect(() => parseCSV(`${CSV_HEADER}\n${[...rows, rows[0]].join('\n')}`, 'UTC', '2026-12-01')).toThrow('2,000');
  });
});
test('ICS export round-trips escaped strings, stable UID and UTC interval', () => {
  const event = { id: 'campus-1', title: 'Music, food; fun\nTonight', location: 'Hall, 2', category: 'Music', event_date: '2026-10-26', pulse_starts_at: '2026-10-26T23:00:00Z', pulse_ends_at: '2026-10-27T01:00:00Z', pulse_revision: 3 };
  const text = serializeEvent(event), parsed = new ICAL.Component(ICAL.parse(text)).getFirstSubcomponent('vevent')!;
  expect(parsed.getFirstPropertyValue('summary')).toBe(event.title);
  expect(parsed.getFirstPropertyValue('uid')).toBe('pulse-event-campus-1@pulse');
  expect(parsed.getFirstPropertyValue('sequence')).toBe(3);
  expect(serializeEvent(event)).toContain('UID:pulse-event-campus-1@pulse');
});
