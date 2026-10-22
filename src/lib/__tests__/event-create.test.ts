import { describe, expect, jest, test } from '@jest/globals';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createEvent, eventCreateError, eventRow, validateEventDraft, type EventDraft } from '../event-create';

const now = Date.parse('2026-10-21T12:00:00Z');
const draft: EventDraft = { title: 'Pick up basketball', location: 'Junker', category: 'Sports', timezone: 'America/New_York', start_local: '2026-11-02T17:00:00', end_local: '2026-11-02T19:00:00' };

describe('event creation', () => {
  test('accepts a valid future event', () => {
    expect(validateEventDraft(draft, now)).toEqual([]);
  });
  test('rejects invalid drafts', () => {
    expect(validateEventDraft({ ...draft, title: '  ' }, now)).toContain('Title must contain 1–200 characters.');
    expect(validateEventDraft({ ...draft, location: '' }, now)).toContain('Location must contain 1–300 characters.');
    expect(validateEventDraft({ ...draft, location: 'x'.repeat(301) }, now)).toContain('Location must contain 1–300 characters.');
    expect(validateEventDraft({ ...draft, timezone: 'Mars/Base' }, now)).toContain('Choose a valid IANA timezone, such as America/New_York.');
    expect(validateEventDraft({ ...draft, start_local: '2027-03-14T02:30:00', end_local: '2027-03-14T03:30:00' }, now)[0]).toMatch(/daylight saving/);
    expect(validateEventDraft({ ...draft, end_local: draft.start_local }, now)).toContain('End must follow start and be within seven days.');
    expect(validateEventDraft({ ...draft, start_local: '2026-10-20T17:00:00', end_local: '2026-10-20T18:00:00' }, now)).toContain('Start must be in the future.');
  });
  test('stores UTC instants with the entered zone and local date', () => {
    expect(eventRow({ ...draft, title: ' Hoops ' })).toEqual({
      title: 'Hoops', location: 'Junker', category: 'Sports', event_date: '2026-11-02',
      pulse_starts_at: '2026-11-02T22:00:00.000Z', pulse_ends_at: '2026-11-03T00:00:00.000Z', pulse_timezone: 'America/New_York',
    });
  });
  test('inserts without choosing an ID or owner', async () => {
    jest.useFakeTimers({ now });
    const single = jest.fn<() => Promise<{ data: { id: string }; error: null }>>().mockResolvedValue({ data: { id: '42' }, error: null });
    const select = jest.fn().mockReturnValue({ single });
    const insert = jest.fn().mockReturnValue({ select });
    const client = { from: jest.fn().mockReturnValue({ insert }) } as unknown as SupabaseClient;
    await expect(createEvent(client, draft)).resolves.toBe('42');
    const row = insert.mock.calls[0][0] as Record<string, unknown>;
    expect(row).not.toHaveProperty('id'); expect(row).not.toHaveProperty('created_by');
    jest.useRealTimers();
  });
  test('explains a missing migration', () => {
    expect(eventCreateError({ code: '42501', message: 'new row violates row-level security policy' })).toMatch(/migration/);
  });
});
