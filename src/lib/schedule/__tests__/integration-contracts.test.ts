import { describe, expect, jest, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { setRSVP } from '../../rsvp-repository';
import { rankEvents } from '../recommendations';
import { eventInterval, type PulseEvent } from '../../event-query';
import { parseICS } from '../import/ics';
import { compareImport, contentKey } from '../import/deduplication';
import type { ScheduleSeries } from '../types';

const base: PulseEvent = { id: '1', title: 'Music', event_date: '2026-10-26', location: 'Hall', category: 'Music', pulse_starts_at: '2026-10-26T14:00Z', pulse_ends_at: '2026-10-26T15:00Z' };
describe('integration contracts', () => {
  test('cancellation uses the transactional RPC even for inaccessible events', async () => {
    const rpc = jest.fn<() => Promise<{ data: string; error: null }>>().mockResolvedValue({ data: 'cancelled', error: null });
    const client = { rpc } as unknown as SupabaseClient;
    expect(await setRSVP(client, 'alice', '1', 'cancelled')).toBe('cancelled');
    expect(rpc).toHaveBeenCalledWith('set_event_rsvp', { p_event: '1', p_status: 'cancelled' });
  });
  test('ranking excludes attendance/cancellation and keeps compatibility ahead of interests', () => {
    const compatible = { ...base, id: 'compatible', category: 'Arts', pulse_starts_at: '2026-10-26T16:00Z', pulse_ends_at: '2026-10-26T17:00Z' };
    const result = rankEvents([base, compatible, { ...base, id: 'cancelled', pulse_cancelled: true }, { ...compatible, id: 'going' }], [eventInterval(base)!], true, ['Music'], ['going'], false);
    expect(result.map(item => [item.event.id,item.compatibility])).toEqual([['compatible','compatible'],['1','conflicting']]);
    expect(rankEvents([base,compatible], [], false, [], [], true)).toEqual([]);
  });
  test('all-day dates span 25 actual hours at fall DST and use an exclusive end', () => {
    const interval = eventInterval({ ...base, pulse_starts_at: null, pulse_ends_at: null, pulse_timezone: 'America/New_York', pulse_all_day_start: '2026-11-01', pulse_all_day_end: '2026-11-02' })!;
    expect(interval.end - interval.start).toBe(25 * 3600000);
  });
  test('unchanged source including exceptions is skipped; changed source needs selection', () => {
    const text = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nBEGIN:VEVENT\r\nUID:test\r\nSUMMARY:Class\r\nDTSTART:20261026T090000Z\r\nDTEND:20261026T100000Z\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const candidate = parseICS(text, 'UTC', '2026-12-01').candidates[0];
    const existing: ScheduleSeries = { ...candidate.draft, id: '1', user_id: 'alice', import_id: 'import', version: 2, content_key: contentKey(candidate.draft) };
    expect(compareImport([candidate],[existing])[0].reason).toBe('duplicate');
    const changed = { ...candidate, draft: { ...candidate.draft, title: 'Updated class' } };
    expect(compareImport([changed],[existing])[0]).toMatchObject({ action:'skip', reason:'changed', existing });
  });
});
